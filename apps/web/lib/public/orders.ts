import {
  CANCELLATION_REASON_LABELS,
  ORDER_STATUS_LABELS,
  buildOrderNumber,
  customerMayCancel,
  haversineKm,
  isCancellationReason,
  isOrderNumber,
  quoteDelivery,
} from "@kanofood/core";
import type { CancellationReason, OrderStatus } from "@kanofood/core";
import { Prisma, prisma } from "@kanofood/db";
import type { PaymentMethod } from "@kanofood/db";

import { ApiError } from "../api/http";
import { signOrderToken, verifyOrderToken } from "../auth/tokens";
import { loadActiveZones } from "../zones";

/**
 * The customer's own orders: placing one, reading it back, cancelling it.
 *
 * This is the first code in the platform that has ever created an order. Every
 * other path — the admin's list, detail, transition and rider assignment — reads
 * or moves an order that already exists, and the database has only ever held
 * orders made by hand. So the shape of a placement is decided here, once.
 *
 * Three rules shape all of it.
 *
 * **The client proposes, the server decides.** The body carries a kitchen, some
 * dish ids and quantities, an address with a point, and a payment method. It does
 * not carry a single amount. Every price is read from the menu as it stands at
 * this instant, and the delivery fee is recomputed from the coordinates. A body
 * with `totalKobo` in it is not rejected, it is ignored, which is the only safe
 * way to treat a number a customer can type.
 *
 * **Nothing is priced from a snapshot that has not been taken.** The item name
 * and unit price are copied onto the order line at placement and never read from
 * the menu again, so an admin editing a price tomorrow cannot rewrite what
 * somebody was charged today. The same applies to the address, which is stored
 * as JSON on the order as well as in the address book.
 *
 * **An order and the record of how it got here are written together.** The
 * `orders.status` column is a cache; `order_events` is the truth, and the row
 * that creates an order carries no `fromStatus` precisely because there was no
 * previous state. Writing one without the other is what makes a status column
 * start lying.
 */

/** How many times a colliding order number is regenerated before giving up. */
const ORDER_NUMBER_ATTEMPTS = 5;

/**
 * The budget for an interactive transaction here.
 *
 * Prisma's default is five seconds, and on 2026-10-18 it killed two placements
 * on a cold dev server: the same body answered a generic 500 while the server
 * was warming and succeeded once it was warm. Placement is a handful of
 * sequential round trips to a database in another country, so the budget is
 * widened rather than the sequence shortened. A placement that fails is a
 * customer's order lost, and nothing in either transaction holds a lock long
 * enough for the extra seconds to matter.
 */
const TRANSACTION = { maxWait: 10_000, timeout: 20_000 } as const;

/** Two letters, which is what `buildOrderNumber` accepts and what a reference
 *  read down a telephone can carry. Randomness is supplied from here rather than
 *  from inside core so the number builder stays testable to the character. */
function randomSuffix(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const pick = (): string => letters[Math.floor(Math.random() * letters.length)]!;
  return `${pick()}${pick()}`;
}

/**
 * One spelling for a phone number.
 *
 * Spacing and dashes are how people type, not information, so both are dropped
 * and a leading `+` is kept. Nothing cleverer happens here on purpose: turning
 * `0803…` into `+234803…` is a Nigerian-specific rewrite that has to be right for
 * every network and every diaspora number, and getting it subtly wrong would
 * merge two different customers into one order history. Richer normalisation is
 * a known gap, not a silent assumption.
 */
export function normalisePhone(phone: string): string {
  const trimmed = phone.trim();
  const keepPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return keepPlus ? `+${digits}` : digits;
}

/** A unique-constraint failure on the order number, and nothing else. */
function isOrderNumberCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  return fields.includes("order_number") || fields.includes("orderNumber");
}

export interface PlaceOrderLine {
  readonly menuItemId: string;
  readonly quantity: number;
  readonly notes?: string | null;
}

export interface PlaceOrderInput {
  readonly kitchenSlug: string;
  readonly lines: readonly PlaceOrderLine[];
  readonly customer: { readonly name: string; readonly phone: string };
  readonly address: {
    readonly label?: string | null;
    readonly addressText: string;
    readonly landmark?: string | null;
    readonly instructions?: string | null;
    /** Required: the delivery fee is measured from this point and there is no
     *  other way to price the journey. A customer with no pin is asked for one
     *  on the location screen rather than charged a guess. */
    readonly lat: number;
    readonly lng: number;
  };
  readonly paymentMethod: PaymentMethod;
  readonly deliveryNotes?: string | null;
}

export interface PlacedOrder {
  readonly id: string;
  readonly orderNumber: string;
  /** Issued once, here. The customer's only credential for this order. */
  readonly token: string;
  readonly status: OrderStatus;
  readonly subtotalKobo: bigint;
  readonly deliveryFeeKobo: bigint;
  readonly totalKobo: bigint;
  readonly paymentMethod: PaymentMethod;
  readonly placedAt: Date;
  readonly kitchenName: string;
  readonly kitchenSlug: string;
  readonly etaMinutes: number | null;
}

/**
 * Place an order.
 *
 * Quantities for a dish that appears twice in the request are summed rather than
 * refused. A cart that lists the same dish on two lines means "two of them", and
 * an error there would be a client bug reported to a customer as their own fault.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
  const kitchen = await prisma.kitchen.findFirst({
    where: { slug: input.kitchenSlug, isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      isOpen: true,
      lat: true,
      lng: true,
      prepTimeMinutes: true,
    },
  });

  if (!kitchen) {
    throw ApiError.notFound("That kitchen is not on KanoFood.");
  }

  // A closed kitchen is refused rather than accepted and rejected later. The
  // storefront disables ordering while a kitchen is shut; this is the same rule
  // enforced where it cannot be bypassed.
  if (!kitchen.isOpen) {
    throw ApiError.conflict(`${kitchen.name} is closed right now. Please order again when they reopen.`);
  }

  // Sum the quantities, keeping the order the customer listed them in so the
  // lines read the way the cart did.
  const wanted = new Map<string, { quantity: number; notes: string | null }>();
  for (const line of input.lines) {
    const existing = wanted.get(line.menuItemId);
    if (existing) {
      existing.quantity += line.quantity;
      existing.notes = existing.notes ?? line.notes?.trim() ?? null;
    } else {
      wanted.set(line.menuItemId, {
        quantity: line.quantity,
        notes: line.notes?.trim() ?? null,
      });
    }
  }

  const items = await prisma.menuItem.findMany({
    where: { id: { in: [...wanted.keys()] }, kitchenId: kitchen.id },
    select: { id: true, name: true, priceKobo: true, isAvailable: true },
  });

  const byId = new Map(items.map((item) => [item.id, item]));

  const lines = [...wanted.entries()].map(([menuItemId, line]) => {
    const item = byId.get(menuItemId);

    // Either the dish does not exist or it belongs to another kitchen. Both are
    // the same answer to a customer: this kitchen does not sell that.
    if (!item) {
      throw ApiError.badRequest("One of the dishes in the cart is not on this menu.");
    }
    if (!item.isAvailable) {
      throw ApiError.conflict(`${item.name} is not available right now. Remove it from the cart to continue.`);
    }

    return {
      menuItemId: item.id,
      nameSnapshot: item.name,
      unitPriceSnapshotKobo: item.priceKobo,
      quantity: line.quantity,
      lineTotalKobo: item.priceKobo * BigInt(line.quantity),
      notes: line.notes,
    };
  });

  const subtotalKobo = lines.reduce((sum, line) => sum + line.lineTotalKobo, 0n);

  // The pin decides the price. A kitchen with no coordinates has no distance to
  // measure, so the zone's base fee applies — the same fallback the public quote
  // route takes, deliberately, so a quote and an order never disagree.
  const point = { lat: input.address.lat, lng: input.address.lng };
  const hasKitchenPin = kitchen.lat !== null && kitchen.lng !== null;
  const distanceKm = hasKitchenPin
    ? haversineKm({ lat: kitchen.lat!, lng: kitchen.lng! }, point)
    : 0;

  const zones = await loadActiveZones({ withFeeBands: hasKitchenPin });
  const quote = quoteDelivery({ zones, point, distanceKm });

  if (!quote.ok) {
    throw ApiError.badRequest("We do not deliver to that address yet. Choose another location.");
  }

  /**
   * The zone's own rule about how it is paid for. `prepaid_required` is a real
   * value in the schema and a cash order into such a zone is one nobody collects,
   * so it is refused here rather than accepted and cancelled an hour later.
   */
  if (quote.paymentRequirement === "prepaid_required" && input.paymentMethod === "cod") {
    throw ApiError.badRequest("Orders to that area must be paid for before delivery. Choose transfer or card.");
  }

  const deliveryFeeKobo = quote.feeKobo;
  // Discounts are deliberately unbuilt in V1 (PRODUCT_SPEC 12.2). The column
  // exists and stays zero, and the total is written from the three parts rather
  // than from anything the caller sent.
  const discountKobo = 0n;
  const totalKobo = subtotalKobo + deliveryFeeKobo + discountKobo;

  const phone = normalisePhone(input.customer.phone);
  const addressSnapshot = {
    label: input.address.label?.trim() || null,
    addressText: input.address.addressText.trim(),
    landmark: input.address.landmark?.trim() || null,
    instructions: input.address.instructions?.trim() || null,
    lat: input.address.lat,
    lng: input.address.lng,
  };

  for (let attempt = 1; ; attempt += 1) {
    const placedAt = new Date();
    const orderNumber = buildOrderNumber({
      kitchenName: kitchen.name,
      at: placedAt,
      suffix: randomSuffix(),
    });

    try {
      const order = await prisma.$transaction(async (tx) => {
        /**
         * A repeat customer is one row, found by phone. `customers.phone` is
         * indexed and deliberately not unique, so this is a lookup rather than an
         * upsert, and a duplicate that already exists is not created again.
         */
        const existing = await tx.customer.findFirst({
          where: { phone },
          select: { id: true, name: true, _count: { select: { addresses: true } } },
        });

        const customer =
          existing ??
          (await tx.customer.create({
            data: { name: input.customer.name.trim(), phone },
            select: { id: true, name: true, _count: { select: { addresses: true } } },
          }));

        /**
         * The address book, kept free of duplicates. Reordering to the same place
         * should not add a row every time, so an address that matches on the text
         * and the point is reused.
         *
         * Nothing points back at this row from the order. `orders` carries
         * `address_snapshot` and no `address_id`, deliberately, so that editing a
         * saved address cannot rewrite an order already placed. This exists for
         * the returning customer's location screen, and the snapshot is what the
         * delivery is actually made from.
         */
        const sameAddress = await tx.address.findFirst({
          where: {
            customerId: customer.id,
            addressText: addressSnapshot.addressText,
            lat: input.address.lat,
            lng: input.address.lng,
          },
          select: { id: true },
        });

        if (!sameAddress) {
          await tx.address.create({
            data: {
              customerId: customer.id,
              label: addressSnapshot.label,
              addressText: addressSnapshot.addressText,
              landmark: addressSnapshot.landmark,
              instructions: addressSnapshot.instructions,
              lat: input.address.lat,
              lng: input.address.lng,
              // The first address a customer gives is where they live.
              isDefault: customer._count.addresses === 0,
            },
          });
        }

        const created = await tx.order.create({
          data: {
            orderNumber,
            customerId: customer.id,
            kitchenId: kitchen.id,
            status: "PENDING_CONFIRMATION",
            addressSnapshot: addressSnapshot as Prisma.InputJsonValue,
            subtotalKobo,
            deliveryFeeKobo,
            discountKobo,
            totalKobo,
            paymentMethod: input.paymentMethod,
            deliveryNotes: input.deliveryNotes?.trim() || null,
            placedAt,
          },
          select: { id: true, orderNumber: true, status: true, placedAt: true },
        });

        await tx.orderItem.createMany({
          data: lines.map((line) => ({
            orderId: created.id,
            menuItemId: line.menuItemId,
            nameSnapshot: line.nameSnapshot,
            unitPriceSnapshotKobo: line.unitPriceSnapshotKobo,
            quantity: line.quantity,
            lineTotalKobo: line.lineTotalKobo,
            notes: line.notes,
          })),
        });

        /**
         * The row that creates the order. No `fromStatus`, because there was no
         * previous state, and no `actorUserId`, because a guest has no user row.
         * The role is what tells an admin reading the timeline that this came in
         * from the storefront rather than from a telephone call.
         */
        await tx.orderEvent.create({
          data: {
            orderId: created.id,
            fromStatus: null,
            toStatus: "PENDING_CONFIRMATION",
            actorUserId: null,
            actorRole: "customer",
            metadata: {
              source: "storefront",
              zoneSlug: quote.zoneSlug,
              pricedBy: quote.pricedBy,
              distanceKm: hasKitchenPin ? Math.round(distanceKm * 100) / 100 : null,
            },
          },
        });

        // One payment row per order, pending, so the admin's reconciliation
        // screen sees an order the moment it is placed rather than only once
        // somebody remembers to create it.
        await tx.payment.create({
          data: { orderId: created.id, method: input.paymentMethod, amountKobo: totalKobo },
        });

        return created;
      }, TRANSACTION);

      const token = await signOrderToken({ orderNumber: order.orderNumber });

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        token,
        status: order.status,
        subtotalKobo,
        deliveryFeeKobo,
        totalKobo,
        paymentMethod: input.paymentMethod,
        placedAt: order.placedAt,
        kitchenName: kitchen.name,
        kitchenSlug: kitchen.slug,
        etaMinutes: kitchen.prepTimeMinutes,
      };
    } catch (error) {
      // Two orders in the same second from the same kitchen draw the same stamp
      // and may draw the same two letters. The unique constraint is the thing
      // that notices; this retries the whole transaction with a fresh suffix
      // rather than reporting a collision the customer cannot act on.
      if (isOrderNumberCollision(error) && attempt < ORDER_NUMBER_ATTEMPTS) continue;
      throw error;
    }
  }
}

export interface OrderAccess {
  /** The guest token issued at placement, if the caller has it. */
  readonly token?: string | null;
  /** The phone the order was placed with, as a second way in. */
  readonly phone?: string | null;
}

/**
 * Whether this caller may see this order.
 *
 * Two ways in, and neither is an account, because there are no customer accounts:
 * the token from the confirmation link, or the order number together with the
 * phone it was placed with. The token is checked against the order number it
 * names, so it cannot be widened into a listing of somebody else's orders.
 *
 * The phone is the weaker of the two and it is a deliberate trade. The
 * alternative is a sign-up wall in front of tracking an order the customer has
 * already paid for, and the order number is not guessable in practice: ten digits
 * of timestamp plus two letters, and the two must match the same customer's
 * phone. Worth revisiting if orders ever become valuable enough to enumerate.
 */
async function assertOrderAccess(
  order: { readonly orderNumber: string; readonly customerPhone: string },
  access: OrderAccess,
): Promise<void> {
  if (access.token) {
    const claims = await verifyOrderToken(access.token);
    if (claims?.orderNumber === order.orderNumber) return;
  }

  if (access.phone && normalisePhone(access.phone) === order.customerPhone) return;

  throw ApiError.unauthorised("That tracking link is not valid for this order.");
}

/** One step on the customer's timeline. */
export interface OrderTrackEvent {
  readonly status: OrderStatus;
  /** The same word an admin and a rider read. Core owns it so they cannot drift. */
  readonly label: string;
  readonly at: Date;
  /** Words, not a code: the reason a cancellation gives, if it gave one. */
  readonly reason: string | null;
}

export interface OrderTrackLine {
  readonly name: string;
  readonly unitPriceKobo: bigint;
  readonly quantity: number;
  readonly lineTotalKobo: bigint;
  readonly notes: string | null;
}

export interface OrderTrackView {
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly statusLabel: string;
  readonly placedAt: Date;
  readonly kitchen: { readonly name: string; readonly slug: string; readonly phone: string | null };
  readonly address: unknown;
  readonly lines: readonly OrderTrackLine[];
  readonly subtotalKobo: bigint;
  readonly deliveryFeeKobo: bigint;
  readonly totalKobo: bigint;
  readonly paymentMethod: PaymentMethod;
  readonly deliveryNotes: string | null;
  readonly timeline: readonly OrderTrackEvent[];
  /** Whether the customer may still cancel, as core's transition table reads it. */
  readonly canCancel: boolean;
}

/**
 * Read one order back.
 *
 * Returns `null` for an order that does not exist so a route can answer 404
 * without a second query, but throws for one that exists and is not this
 * caller's: "not yours" and "not there" are different answers and collapsing
 * them would tell a customer their order had vanished.
 */
export async function readOrder(
  orderNumber: string,
  access: OrderAccess,
): Promise<OrderTrackView | null> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: {
      orderNumber: true,
      status: true,
      placedAt: true,
      addressSnapshot: true,
      subtotalKobo: true,
      deliveryFeeKobo: true,
      totalKobo: true,
      paymentMethod: true,
      deliveryNotes: true,
      customer: { select: { phone: true } },
      kitchen: { select: { name: true, slug: true, phone: true } },
      items: {
        select: {
          nameSnapshot: true,
          unitPriceSnapshotKobo: true,
          quantity: true,
          lineTotalKobo: true,
          notes: true,
        },
        orderBy: { createdAt: "asc" },
      },
      events: {
        select: { toStatus: true, reason: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!order) return null;

  await assertOrderAccess(
    { orderNumber: order.orderNumber, customerPhone: order.customer.phone },
    access,
  );

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    placedAt: order.placedAt,
    kitchen: order.kitchen,
    address: order.addressSnapshot,
    lines: order.items.map((item) => ({
      name: item.nameSnapshot,
      unitPriceKobo: item.unitPriceSnapshotKobo,
      quantity: item.quantity,
      lineTotalKobo: item.lineTotalKobo,
      notes: item.notes,
    })),
    subtotalKobo: order.subtotalKobo,
    deliveryFeeKobo: order.deliveryFeeKobo,
    totalKobo: order.totalKobo,
    paymentMethod: order.paymentMethod,
    deliveryNotes: order.deliveryNotes,
    timeline: order.events.map((event) => ({
      status: event.toStatus,
      label: ORDER_STATUS_LABELS[event.toStatus],
      at: event.createdAt,
      reason: event.reason,
    })),
    canCancel: customerMayCancel(order.status),
  };
}

/**
 * Cancel an order, as the customer.
 *
 * The reason is required, and that is the domain's rule rather than this file's:
 * `requiresReason` is true for `CUSTOMER_CANCELLED`, and the same check guards
 * the admin's transitions. It arrives as a code from a fixed list and is stored
 * as its label, so the column stays readable to whoever opens it next, and the
 * tracking screen can print it back without knowing a vocabulary.
 *
 * The move is conditional on the status the caller was shown, exactly as the
 * admin's is, so a customer and a kitchen acting at the same moment produce one
 * cancellation and one conflict rather than two histories.
 */
export async function cancelOrder(input: {
  readonly orderNumber: string;
  readonly access: OrderAccess;
  readonly reason: CancellationReason;
}): Promise<{ readonly status: OrderStatus; readonly at: Date }> {
  if (!isCancellationReason(input.reason)) {
    throw ApiError.badRequest("Choose a reason for cancelling.");
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber: input.orderNumber },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      customer: { select: { phone: true } },
    },
  });

  if (!order) throw ApiError.notFound("That order is not on KanoFood.");

  await assertOrderAccess(
    { orderNumber: order.orderNumber, customerPhone: order.customer.phone },
    input.access,
  );

  if (!customerMayCancel(order.status)) {
    // Three different situations arrive here as one `false`, so the customer is
    // told the one that is actually true. The rider message is reserved for the
    // statuses where a rider really is assigned; an order that has already ended
    // must not claim one.
    if (order.status === "CUSTOMER_CANCELLED") {
      throw ApiError.conflict("This order has already been cancelled.");
    }
    if (
      order.status === "RIDER_ASSIGNED" ||
      order.status === "PICKED_UP" ||
      order.status === "OUT_FOR_DELIVERY"
    ) {
      throw ApiError.conflict(
        "A rider is already on this order, so it can no longer be cancelled here. Please call us.",
      );
    }
    throw ApiError.conflict("This order has already ended and can no longer be cancelled.");
  }

  const at = new Date();
  const reason = CANCELLATION_REASON_LABELS[input.reason];

  await prisma.$transaction(async (tx) => {
    const moved = await tx.order.updateMany({
      // The guard. This is the only thing stopping a customer cancelling an
      // order the kitchen accepted a second earlier.
      where: { id: order.id, status: order.status },
      data: { status: "CUSTOMER_CANCELLED", customerCancelledAt: at },
    });

    if (moved.count === 0) {
      throw ApiError.conflict(
        "That order moved while you were looking at it. Open it again to see where it is.",
      );
    }

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: "CUSTOMER_CANCELLED",
        actorUserId: null,
        actorRole: "customer",
        reason,
        metadata: { reasonCode: input.reason, source: "storefront" },
      },
    });
  }, TRANSACTION);

  return { status: "CUSTOMER_CANCELLED", at };
}

/** A cheap shape check, so a malformed tracking URL costs no database round trip. */
export function looksLikeOrderNumber(value: string): boolean {
  return isOrderNumber(value);
}
