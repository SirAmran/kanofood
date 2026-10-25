import { Prisma, prisma } from "@kanofood/db";
import {
  DELIVERY_FAILURE_REASON_LABELS,
  ORDER_STATUS_LABELS,
  assertReasonProvided,
  canTransition,
  isDeliveryFailureReason,
  type DeliveryFailureReason,
  type OrderStatus,
} from "@kanofood/core";

import { ApiError } from "../api/http";
import { lagosDayStartDaysAgo } from "../admin/status";
import { queueOrderStatus } from "../notifications/dispatch";
import { statusTimestamps } from "../order-timestamps";

/**
 * The rider's deliveries. Screens 6.2 to 6.5 in docs/UX_SPEC.md.
 *
 * Everything here is scoped by a rider id that came from the caller's own rider
 * row, never from the request. A rider cannot read, let alone move, another
 * rider's delivery even by guessing its id: the scoping is in the `where` clause
 * of every query and of the conditional update, so there is no read-then-check
 * window to race.
 *
 * **The rider moves five edges.** Picked up, out for delivery, delivered, and
 * delivery failed. Accepting, preparing, assigning and cancelling belong to the
 * kitchen and the platform. `RIDER_EDGES` is the allow-list, deliberately
 * separate from the domain's transition table: the domain says what legal moves
 * exist, this says which of them are the rider's to make.
 */

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface RiderDeliveryRow {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly kitchenName: string;
  readonly customerName: string;
  readonly customerPhone: string;
  /** The landmark when there is one, else the address text. */
  readonly deliveryArea: string;
  readonly addressText: string;
  readonly landmark: string | null;
  readonly amountToCollectKobo: bigint;
  readonly paymentMethod: "cod" | "transfer" | "card";
  readonly assignedAt: Date;
  /** The single move this card offers, or null when nothing is left to do. */
  readonly nextAction: OrderStatus | null;
  /** Why the order ended, when it ended without being delivered. */
  readonly failureReason: string | null;
  /** Cancelled or failed: the rider may close it off their list. */
  readonly canAcknowledge: boolean;
}

export interface RiderDeliveryList {
  readonly rows: readonly RiderDeliveryRow[];
  /** Still to be done today, and finished today. The split the screen shows. */
  readonly openCount: number;
  readonly doneCount: number;
  /** Everything the rider is holding in cash, not yet handed over. */
  readonly cashHeldKobo: bigint;
}

/** How far back "today's deliveries" reaches and how far forward it never does. */
const LOOKBACK_DAYS = 2;

/**
 * The rider's list.
 *
 * Ordered so the next thing to do is first: live deliveries by how long the
 * rider has had them, then the finished and cancelled ones newest first. A
 * rider's whole job is "what do I do next", so urgency leads.
 *
 * **Cancelled orders stay on the list** rather than vanishing when an admin
 * cancels underneath them. A rider who is already riding to an address the
 * platform cancelled needs to see that, not an empty screen where a job used to
 * be. They are marked, and the rider can acknowledge them off the list.
 */
export async function listRiderDeliveries(input: {
  readonly riderId: string;
  readonly now?: Date;
}): Promise<RiderDeliveryList> {
  const since = lagosDayStartDaysAgo(LOOKBACK_DAYS, input.now ?? new Date());

  const [deliveries, cash] = await Promise.all([
    prisma.delivery.findMany({
      where: {
        riderId: input.riderId,
        createdAt: { gte: since },
        // Acknowledged cancellations are history and stop being work.
        acknowledgedAt: null,
      },
      orderBy: { assignedAt: "desc" },
      select: {
        assignedAt: true,
        failureReason: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalKobo: true,
            paymentMethod: true,
            addressSnapshot: true,
            customer: { select: { name: true, phone: true } },
            kitchen: { select: { name: true } },
            payments: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { status: true, amountKobo: true },
            },
          },
        },
      },
    }),
    prisma.cashCollection.aggregate({
      where: { riderId: input.riderId, status: "pending" },
      _sum: { amountKobo: true },
    }),
  ]);

  const rows: RiderDeliveryRow[] = deliveries.map((delivery) => {
    const order = delivery.order;
    const address = readAddressSnapshot(order.addressSnapshot);
    const live = isLiveStatus(order.status);
    const cancelled = isCancellingStatus(order.status);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      kitchenName: order.kitchen.name,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      deliveryArea: address.landmark ?? address.addressText,
      addressText: address.addressText,
      landmark: address.landmark,
      amountToCollectKobo: amountToCollect(order.totalKobo, order.paymentMethod, order.payments[0]),
      paymentMethod: order.paymentMethod,
      assignedAt: delivery.assignedAt,
      nextAction: riderChoices(order.status)[0] ?? null,
      failureReason: delivery.failureReason,
      canAcknowledge: cancelled && !live,
    };
  });

  const open = rows.filter((row) => isLiveStatus(row.status));
  const done = rows.filter((row) => !isLiveStatus(row.status));

  return {
    rows: [...open, ...done],
    openCount: open.length,
    doneCount: done.length,
    cashHeldKobo: cash._sum.amountKobo ?? 0n,
  };
}

/**
 * What the customer hands over, which is not always the order total.
 *
 * A transfer or card order was paid before the rider arrived, so the rider
 * collects nothing and the card must say so rather than showing a number that
 * invites them to ask for money twice. A cash order collects the total unless a
 * payment against it has already been recorded, in which case the rider is
 * collecting only what is outstanding.
 */
function amountToCollect(
  totalKobo: bigint,
  method: "cod" | "transfer" | "card",
  payment: { readonly status: string; readonly amountKobo: bigint } | undefined,
): bigint {
  if (method !== "cod") {
    // A transfer the platform has not yet confirmed may still need chasing, but
    // the rider does not collect it, so the number stays zero either way.
    return 0n;
  }
  if (payment && payment.status === "collected") return 0n;
  return totalKobo;
}

function isLiveStatus(status: OrderStatus): boolean {
  return (
    status === "RIDER_ASSIGNED" ||
    status === "PICKED_UP" ||
    status === "OUT_FOR_DELIVERY"
  );
}

/**
 * The statuses an admin or customer ended underneath the rider.
 *
 * Not `DELIVERY_FAILED`: that one is the rider's own act, and a rider must not
 * be able to acknowledge their own failure off the screen before the admin has
 * resolved it.
 */
export function isCancellingStatus(status: OrderStatus): boolean {
  return (
    status === "CUSTOMER_CANCELLED" ||
    status === "ADMIN_CANCELLED" ||
    status === "KITCHEN_REJECTED"
  );
}

export interface RiderDeliveryDetail {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly statusLabel: string;
  readonly placedAt: Date;
  readonly assignedAt: Date;
  readonly subtotalKobo: bigint;
  readonly deliveryFeeKobo: bigint;
  readonly totalKobo: bigint;
  readonly amountToCollectKobo: bigint;
  /** What has actually been recorded against the order so far, if anything. */
  readonly collectedKobo: bigint;
  /** True once the office has counted the cash, which closes the float for this order. */
  readonly reconciled: boolean;
  readonly paymentMethod: "cod" | "transfer" | "card";
  readonly deliveryNotes: string | null;
  readonly customer: { readonly name: string; readonly phone: string };
  /**
   * A kitchen's phone and address are nullable in the schema, and a kitchen
   * created by the admin without them is a real row. The screen says "not given"
   * rather than the page failing, because a rider still has to deliver the food.
   */
  readonly kitchen: {
    readonly name: string;
    readonly phone: string | null;
    readonly address: string | null;
  };
  readonly deliveryAddress: OrderAddressSnapshot;
  readonly kitchenAddress: OrderAddressSnapshot;
  readonly items: readonly {
    readonly id: string;
    readonly name: string;
    readonly quantity: number;
    readonly lineTotalKobo: bigint;
    readonly notes: string | null;
  }[];
  readonly events: readonly {
    readonly id: string;
    readonly fromStatus: OrderStatus | null;
    readonly toStatus: OrderStatus;
    readonly createdAt: Date;
  }[];
  readonly failureReason: string | null;
  readonly actions: readonly OrderStatus[];
}

/**
 * One delivery in full. Screen 6.3.
 *
 * Both addresses and both phone numbers, because a rider taps the kitchen's
 * number when the gate is shut and the customer's when the phone is not
 * answering. The kitchen's address comes from its own snapshot columns; the
 * customer's from the order's frozen copy, never from the customer row, because
 * an address edited after the order was placed must not move a delivery.
 */
export async function loadRiderDelivery(input: {
  readonly riderId: string;
  readonly orderId: string;
}): Promise<RiderDeliveryDetail | null> {
  const delivery = await prisma.delivery.findFirst({
    where: { order: { id: input.orderId }, riderId: input.riderId },
    select: {
      assignedAt: true,
      failureReason: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          placedAt: true,
          subtotalKobo: true,
          deliveryFeeKobo: true,
          totalKobo: true,
          paymentMethod: true,
          deliveryNotes: true,
          addressSnapshot: true,
          customer: { select: { name: true, phone: true } },
          kitchen: {
            select: {
              name: true,
              phone: true,
              addressText: true,
              landmark: true,
              lat: true,
              lng: true,
            },
          },
          items: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              nameSnapshot: true,
              quantity: true,
              lineTotalKobo: true,
              notes: true,
            },
          },
          events: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              fromStatus: true,
              toStatus: true,
              createdAt: true,
            },
          },
          payments: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { status: true, amountKobo: true },
          },
        },
      },
    },
  });

  if (!delivery) return null;

  const order = delivery.order;

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    placedAt: order.placedAt,
    assignedAt: delivery.assignedAt,
    subtotalKobo: order.subtotalKobo,
    deliveryFeeKobo: order.deliveryFeeKobo,
    totalKobo: order.totalKobo,
    amountToCollectKobo: amountToCollect(order.totalKobo, order.paymentMethod, order.payments[0]),
    collectedKobo:
      order.payments[0]?.status === "collected" || order.payments[0]?.status === "reconciled"
        ? order.payments[0].amountKobo
        : 0n,
    reconciled: order.payments[0]?.status === "reconciled",
    paymentMethod: order.paymentMethod,
    deliveryNotes: order.deliveryNotes,
    customer: order.customer,
    kitchen: {
      name: order.kitchen.name,
      phone: order.kitchen.phone,
      address: order.kitchen.addressText,
    },
    deliveryAddress: readAddressSnapshot(order.addressSnapshot),
    kitchenAddress: {
      label: null,
      addressText: order.kitchen.addressText ?? "",
      landmark: order.kitchen.landmark,
      instructions: null,
      lat: order.kitchen.lat === null ? null : Number(order.kitchen.lat),
      lng: order.kitchen.lng === null ? null : Number(order.kitchen.lng),
    },
    items: order.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      quantity: item.quantity,
      lineTotalKobo: item.lineTotalKobo,
      notes: item.notes,
    })),
    events: order.events.map((event) => ({
      id: event.id,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      createdAt: event.createdAt,
    })),
    failureReason: delivery.failureReason,
    actions: riderChoices(order.status),
  };
}

export interface OrderAddressSnapshot {
  readonly label: string | null;
  readonly addressText: string;
  readonly landmark: string | null;
  readonly instructions: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

/**
 * The address, read defensively.
 *
 * `address_snapshot` is JSON written in one shape, but a JSON column is a column
 * that eventually holds another shape. A card should show what it can and never
 * fail to render because an old order is missing a key.
 */
export function readAddressSnapshot(value: unknown): OrderAddressSnapshot {
  const record = (value ?? {}) as Record<string, unknown>;
  const text = (key: string): string | null =>
    typeof record[key] === "string" && String(record[key]).trim() !== ""
      ? String(record[key])
      : null;
  const number = (key: string): number | null =>
    typeof record[key] === "number" && Number.isFinite(record[key]) ? Number(record[key]) : null;

  return {
    label: text("label"),
    addressText: text("addressText") ?? "",
    landmark: text("landmark"),
    instructions: text("instructions"),
    lat: number("lat"),
    lng: number("lng"),
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * The moves that belong to the rider, per status.
 *
 * `RIDER_ASSIGNED -> PICKED_UP`, then `PICKED_UP -> OUT_FOR_DELIVERY`, then
 * either `DELIVERED` or `DELIVERY_FAILED`. Every other legal edge in the domain
 * is somebody else's.
 */
const RIDER_EDGES: Readonly<Partial<Record<OrderStatus, readonly OrderStatus[]>>> = {
  RIDER_ASSIGNED: ["PICKED_UP"],
  PICKED_UP: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED"],
};

export function riderChoices(from: OrderStatus): readonly OrderStatus[] {
  return RIDER_EDGES[from] ?? [];
}

export interface RiderTransitionInput {
  readonly orderId: string;
  readonly riderId: string;
  /** The status the caller believes the order is in. */
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  readonly actor: { readonly userId: string };
  /** Required for a failure; refused on every other move. */
  readonly reasonCode?: DeliveryFailureReason | null;
  /** Optional free text the rider typed, stored in the event's metadata. */
  readonly note?: string | null;
}

/**
 * Move one of this rider's deliveries, and record who did it.
 *
 * The conditional update (`order.id`, `delivery.riderId`, `order.status: from`)
 * is the race guard and the ownership check in one statement: a rider acting on
 * an order they were not given matches zero rows, and two taps on the same
 * button cannot both succeed. The delivery id is resolved first so the failure
 * message can distinguish "not yours" from "moved under you", but the write
 * itself re-checks the rider, because the lookup and the write are not the same
 * instant.
 */
export async function transitionRiderDelivery(input: RiderTransitionInput): Promise<Date> {
  const choices = riderChoices(input.from);
  if (!choices.includes(input.to)) {
    throw ApiError.conflict(
      "That is not something a rider can do to a delivery in this state. Refresh to see where it is now.",
    );
  }

  if (!canTransition(input.from, input.to)) {
    throw ApiError.conflict("That delivery cannot move there. Refresh the page.");
  }

  let reason: string | null = null;
  if (input.to === "DELIVERY_FAILED") {
    if (!isDeliveryFailureReason(input.reasonCode)) {
      throw ApiError.badRequest("Choose a reason for the failed delivery.");
    }
    reason = DELIVERY_FAILURE_REASON_LABELS[input.reasonCode];
  } else if (input.reasonCode) {
    throw ApiError.badRequest("A reason only belongs on a failed delivery.");
  }

  try {
    assertReasonProvided(input.to, reason);
  } catch (error) {
    throw ApiError.badRequest(
      error instanceof Error ? error.message : "A reason is required for that change.",
    );
  }

  const delivery = await prisma.delivery.findFirst({
    where: { orderId: input.orderId, riderId: input.riderId },
    select: { id: true },
  });
  if (!delivery) {
    // Same answer whether the order does not exist or belongs to another rider.
    // Telling them apart would let a rider enumerate real order ids.
    throw ApiError.notFound(
      "That delivery is not on your list. Refresh to see what is.",
    );
  }

  const at = new Date();
  const note = input.note?.trim() || null;

  await prisma.$transaction(
    async (tx) => {
      const moved = await tx.order.updateMany({
        where: {
          id: input.orderId,
          status: input.from,
          delivery: { riderId: input.riderId },
        },
        data: { status: input.to, ...statusTimestamps(input.to, at) },
      });

      if (moved.count === 0) {
        throw ApiError.conflict(
          "That delivery moved while this page was open. Refresh to see where it is now.",
        );
      }

      // The delivery row mirrors the order's own timestamps so the two never
      // disagree about when a rider picked something up.
      const deliveryAt =
        input.to === "PICKED_UP"
          ? { pickedUpAt: at }
          : input.to === "OUT_FOR_DELIVERY"
            ? { outForDeliveryAt: at }
            : input.to === "DELIVERED"
              ? { deliveredAt: at }
              : { failedAt: at, failureReason: reason };

      await tx.delivery.update({
        where: { id: delivery.id },
        data: deliveryAt,
      });

      await tx.orderEvent.create({
        data: {
          orderId: input.orderId,
          fromStatus: input.from,
          toStatus: input.to,
          actorUserId: input.actor.userId,
          actorRole: "rider",
          reason,
          metadata: {
            ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
            ...(note ? { note } : {}),
          } as Prisma.InputJsonValue,
        },
      });

      // A cash order delivered in full is collected at the door. Recorded here
      // rather than as a second rider action because the rider is already tapping
      // "delivered" with the money in their hand, and a second screen is a second
      // thing to forget at the end of a long shift.
      if (input.to === "DELIVERED") {
        await collectCashOnDelivery(tx, {
          orderId: input.orderId,
          riderId: input.riderId,
          at,
        });
      }
    },
    // The same widened budget the order placement carries. The default is five
    // seconds and the database is in another country: a cold dev server took
    // 5.7s to commit this transaction on 2026-10-24 and answered 500. The work
    // is correct; the default was too tight for it.
    { timeout: 20000, maxWait: 10000 },
  );

  // Out for delivery and delivered both tell the customer; a failure tells the
  // admin and the customer, with the rider's stated reason attached.
  queueOrderStatus(input.orderId, input.to);

  return at;
}

/**
 * Record what the rider is now holding, when the money changes hands.
 *
 * Only for a cash order with nothing already collected against it. Writes two
 * rows: a `payment` saying this order was paid in cash, and a `cash_collection`
 * saying this rider is holding that much. The two share no key, which is the
 * known schema gap: the collection cannot be traced back to the order it came
 * from, and that is reported on the admin cash screen rather than papered over
 * here.
 *
 * A transfer or card order records nothing: it was paid before the rider left.
 */
async function collectCashOnDelivery(
  tx: Prisma.TransactionClient,
  input: { readonly orderId: string; readonly riderId: string; readonly at: Date },
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: input.orderId },
    select: {
      orderNumber: true,
      totalKobo: true,
      paymentMethod: true,
      payments: {
        where: { status: { in: ["collected", "reconciled"] } },
        select: { id: true },
      },
    },
  });

  if (!order) return;
  if (order.paymentMethod !== "cod") return;
  // Already collected earlier: do not record the same money twice.
  if (order.payments.length > 0) return;
  if (order.totalKobo <= 0n) return;

  await tx.payment.create({
    data: {
      orderId: input.orderId,
      method: "cod",
      amountKobo: order.totalKobo,
      status: "collected",
      collectedByRiderId: input.riderId,
      collectedAt: input.at,
    },
  });

  await tx.cashCollection.create({
    data: {
      riderId: input.riderId,
      amountKobo: order.totalKobo,
      collectedAt: input.at,
      status: "pending",
      // The order number in the notes is load-bearing: `cash_collections` has no
      // order reference, so this is the only thing that lets a later correction
      // find the row it corrects instead of guessing by amount.
      notes: orderTag(order.orderNumber),
    },
  });
}

/** The prefix every cash collection this interface writes starts with. */
function orderTag(orderNumber: string): string {
  return `Order ${orderNumber}`;
}

/**
 * Record what the rider actually took at the door, when it differs.
 *
 * Screen 6.4. The amount the customer hands over is not always the total: a
 * customer with no change short-pays, or rounds up. What was actually collected
 * is what the payment row records, because that is what `amount_collected` means
 * in section 5 and the difference must not be hidden inside a total that says
 * otherwise. The expected figure, the collected figure and the gap go into the
 * collection's note, which is where the admin screen looks for it.
 *
 * **Both ledgers are written here, and that is the fix for a double count.** A
 * rider may record cash before tapping "delivered". `collectCashOnDelivery` skips
 * an order that already has a collected payment, so writing the payment row now
 * is what stops the float being credited twice. It also means an order reads as
 * paid the moment the money is in the rider's hand, which is the truth.
 *
 * The collection row is found by the order number in its notes. There is no
 * order column on `cash_collections` to join on, so the tag created here and in
 * `collectCashOnDelivery` is the link, and matching on the amount was how the
 * previous version could correct the wrong order's row.
 */
export async function recordRiderCash(input: {
  readonly orderId: string;
  readonly riderId: string;
  readonly amountKobo: bigint;
  readonly expectedKobo: bigint;
  readonly note?: string | null;
}): Promise<{ readonly shortfallKobo: bigint; readonly surplusKobo: bigint }> {
  const delivery = await prisma.delivery.findFirst({
    where: { orderId: input.orderId, riderId: input.riderId },
    select: { id: true, order: { select: { orderNumber: true, paymentMethod: true } } },
  });
  if (!delivery) {
    throw ApiError.notFound("That delivery is not on your list.");
  }
  if (delivery.order.paymentMethod !== "cod") {
    throw ApiError.conflict("That order was not paid in cash, so there is nothing to record.");
  }
  if (input.amountKobo < 0n) {
    throw ApiError.badRequest("A collected amount cannot be negative.");
  }

  const shortfall = input.expectedKobo > input.amountKobo ? input.expectedKobo - input.amountKobo : 0n;
  const surplus = input.amountKobo > input.expectedKobo ? input.amountKobo - input.expectedKobo : 0n;

  const parts = [
    orderTag(delivery.order.orderNumber),
    `expected ${naira(input.expectedKobo)}`,
    `collected ${naira(input.amountKobo)}`,
  ];
  if (shortfall > 0n) parts.push(`short ${naira(shortfall)}`);
  if (surplus > 0n) parts.push(`over ${naira(surplus)}`);
  if (input.note?.trim()) parts.push(input.note.trim());
  const notes = parts.join("; ");

  await prisma.$transaction(async (tx) => {
    const at = new Date();

    // The payment row, whatever its state. A pending one becomes collected; a
    // collected one (written at delivery time) has its amount corrected.
    const payment = await tx.payment.findFirst({
      where: { orderId: input.orderId, status: { in: ["pending", "collected"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });

    if (payment) {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          method: "cod",
          amountKobo: input.amountKobo,
          status: "collected",
          collectedByRiderId: input.riderId,
          ...(payment.status === "collected" ? {} : { collectedAt: at }),
        },
      });
    } else {
      await tx.payment.create({
        data: {
          orderId: input.orderId,
          method: "cod",
          amountKobo: input.amountKobo,
          status: "collected",
          collectedByRiderId: input.riderId,
          collectedAt: at,
        },
      });
    }

    const tagged = await tx.cashCollection.findFirst({
      where: {
        riderId: input.riderId,
        status: "pending",
        notes: { startsWith: orderTag(delivery.order.orderNumber) },
      },
      orderBy: { collectedAt: "desc" },
      select: { id: true },
    });

    if (tagged) {
      await tx.cashCollection.update({
        where: { id: tagged.id },
        data: { amountKobo: input.amountKobo, notes },
      });
    } else {
      await tx.cashCollection.create({
        data: {
          riderId: input.riderId,
          amountKobo: input.amountKobo,
          collectedAt: at,
          status: "pending",
          notes,
        },
      });
    }
  },
  // Same widened budget as the transitions above: the default five seconds is
  // too tight for a database in another region on a cold dev server.
  { timeout: 20000, maxWait: 10000 },
);

  return { shortfallKobo: shortfall, surplusKobo: surplus };
}

function naira(kobo: bigint): string {
  const nairaValue = kobo / 100n;
  const koboPart = kobo % 100n;
  return `₦${nairaValue.toLocaleString("en-NG")}${koboPart === 0n ? "" : `.${koboPart.toString().padStart(2, "0")}`}`;
}

/**
 * Take a cancelled delivery off the rider's list.
 *
 * Only for a cancellation the platform made, never for the rider's own failure:
 * a failure stays until the admin has resolved it, so the two screens do not
 * both close it and the admin's queue never empties itself.
 */
export async function acknowledgeRiderDelivery(input: {
  readonly orderId: string;
  readonly riderId: string;
}): Promise<void> {
  const delivery = await prisma.delivery.findFirst({
    where: { orderId: input.orderId, riderId: input.riderId },
    select: { id: true, acknowledgedAt: true, order: { select: { status: true } } },
  });
  if (!delivery) throw ApiError.notFound("That delivery is not on your list.");
  if (delivery.acknowledgedAt) return;
  if (!isCancellingStatus(delivery.order.status)) {
    throw ApiError.conflict("That delivery is still live, so it cannot be cleared.");
  }

  await prisma.delivery.update({
    where: { id: delivery.id },
    data: { acknowledgedAt: new Date() },
  });
}
