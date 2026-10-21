import { Prisma, prisma } from "@kanofood/db";
import {
  KITCHEN_REJECTION_REASON_LABELS,
  assertReasonProvided,
  canTransition,
  isKitchenRejectionReason,
  type KitchenRejectionReason,
  type OrderStatus,
} from "@kanofood/core";

import { ApiError } from "../api/http";
import { statusTimestamps } from "../order-timestamps";

/**
 * The kitchen's order queue. Screens 5.3 and 5.4 in docs/UX_SPEC.md.
 *
 * Everything here is scoped by a kitchen id that came from the caller's
 * membership, never from the request. That is the security property the whole
 * interface rests on: an operator at one kitchen must not be able to read, let
 * alone move, another kitchen's order even by guessing its id. The scoping is in
 * the `where` clause of every query and of the conditional update, so there is
 * no read-then-check window to race.
 *
 * **The kitchen moves only four edges.** Accept, reject, start preparing, mark
 * ready. Confirming an order with the customer, assigning a rider and delivering
 * it belong to the platform and the rider. `KITCHEN_EDGES` is the allow-list and
 * it is deliberately separate from the domain's transition table: the domain
 * says what legal moves exist, this says which of them are the kitchen's to make.
 * A move that is legal but not the kitchen's is refused here.
 */

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export type KitchenTab = "new" | "preparing" | "ready" | "completed";

/**
 * Which statuses each tab shows.
 *
 * "New" is `CONFIRMED`, not `PENDING_CONFIRMATION`: the platform telephones the
 * customer to confirm first, and a kitchen that starts cooking an unconfirmed
 * order is cooking for a call that may never connect.
 *
 * "Ready" keeps an order visible after a rider is assigned and until it is
 * picked up, because "ready and waiting for collection" is exactly what the
 * kitchen needs to know. From the moment it leaves the building it belongs to
 * "Completed".
 */
export const KITCHEN_TAB_STATUSES: Readonly<Record<KitchenTab, readonly OrderStatus[]>> = {
  new: ["CONFIRMED"],
  preparing: ["KITCHEN_ACCEPTED", "PREPARING"],
  ready: ["READY_FOR_PICKUP", "RIDER_ASSIGNED"],
  completed: [
    "PICKED_UP",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CUSTOMER_CANCELLED",
    "KITCHEN_REJECTED",
    "ADMIN_CANCELLED",
    "DELIVERY_FAILED",
  ],
};

export const KITCHEN_TABS: readonly { readonly key: KitchenTab; readonly label: string }[] = [
  { key: "new", label: "New" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "completed", label: "Completed" },
];

export function isKitchenTab(value: unknown): value is KitchenTab {
  return value === "new" || value === "preparing" || value === "ready" || value === "completed";
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface KitchenOrderRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly totalKobo: bigint;
  readonly placedAt: Date;
  readonly customerName: string;
  /** A landmark or the address text, whichever is more useful at a glance. */
  readonly deliveryArea: string;
  readonly items: readonly { readonly name: string; readonly quantity: number }[];
}

export interface KitchenOrderList {
  readonly rows: readonly KitchenOrderRow[];
  readonly tab: KitchenTab;
  /** How many orders sit in each tab. Counted without the tab filter applied. */
  readonly counts: Readonly<Record<KitchenTab, number>>;
  readonly total: number;
}

export const KITCHEN_PAGE_SIZE = 50;

export async function listKitchenOrders(input: {
  readonly kitchenId: string;
  readonly tab: KitchenTab;
  readonly page?: number;
}): Promise<KitchenOrderList> {
  const page = Math.max(1, input.page ?? 1);

  const [rows, total, grouped] = await Promise.all([
    prisma.order.findMany({
      where: {
        kitchenId: input.kitchenId,
        status: { in: [...KITCHEN_TAB_STATUSES[input.tab]] },
      },
      orderBy: { placedAt: "asc" },
      skip: (page - 1) * KITCHEN_PAGE_SIZE,
      take: KITCHEN_PAGE_SIZE,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalKobo: true,
        placedAt: true,
        addressSnapshot: true,
        customer: { select: { name: true } },
        items: {
          orderBy: { createdAt: "asc" },
          select: { nameSnapshot: true, quantity: true },
        },
      },
    }),
    prisma.order.count({
      where: {
        kitchenId: input.kitchenId,
        status: { in: [...KITCHEN_TAB_STATUSES[input.tab]] },
      },
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: { kitchenId: input.kitchenId },
      _count: { _all: true },
    }),
  ]);

  const byStatus = new Map(grouped.map((row) => [row.status, row._count._all]));
  const counts: Record<KitchenTab, number> = { new: 0, preparing: 0, ready: 0, completed: 0 };

  for (const tab of KITCHEN_TABS) {
    counts[tab.key] = KITCHEN_TAB_STATUSES[tab.key].reduce(
      (sum, status) => sum + (byStatus.get(status) ?? 0),
      0,
    );
  }

  return {
    rows: rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.status,
      totalKobo: row.totalKobo,
      placedAt: row.placedAt,
      customerName: row.customer.name,
      deliveryArea: readDeliveryArea(row.addressSnapshot),
      items: row.items.map((item) => ({ name: item.nameSnapshot, quantity: item.quantity })),
    })),
    tab: input.tab,
    counts,
    total,
  };
}

/**
 * The delivery address, read defensively.
 *
 * `address_snapshot` is JSON: written by the order API in one shape, but a
 * column that accepts any JSON is a column that eventually holds another shape.
 * A card should show what it can and never fail to render because a snapshot
 * from an old order is missing a key.
 */
export interface OrderAddressSnapshot {
  readonly label: string | null;
  readonly addressText: string;
  readonly landmark: string | null;
  readonly instructions: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

function readAddressSnapshot(value: unknown): OrderAddressSnapshot {
  const record = (value ?? {}) as Record<string, unknown>;
  const text = (key: string): string | null =>
    typeof record[key] === "string" && record[key].trim() !== "" ? String(record[key]) : null;
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

function readDeliveryArea(value: unknown): string {
  const address = readAddressSnapshot(value);
  return address.landmark ?? address.addressText ?? "";
}

export interface KitchenOrderEvent {
  readonly id: string;
  readonly fromStatus: OrderStatus | null;
  readonly toStatus: OrderStatus;
  readonly actorName: string | null;
  readonly actorRole: string | null;
  readonly reason: string | null;
  readonly createdAt: Date;
}

export interface KitchenOrderDetail {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly placedAt: Date;
  readonly subtotalKobo: bigint;
  readonly deliveryFeeKobo: bigint;
  readonly totalKobo: bigint;
  readonly paymentMethod: "cod" | "transfer" | "card";
  readonly deliveryNotes: string | null;
  readonly customer: { readonly name: string; readonly phone: string };
  readonly address: OrderAddressSnapshot;
  readonly items: readonly {
    readonly id: string;
    readonly name: string;
    readonly quantity: number;
    readonly unitPriceKobo: bigint;
    readonly lineTotalKobo: bigint;
    readonly notes: string | null;
  }[];
  readonly events: readonly KitchenOrderEvent[];
  /** The delivery once a rider has it. Name only: the rider is not this screen's to call. */
  readonly riderName: string | null;
  /** The moves the kitchen may make from here. Empty when it is done with it. */
  readonly actions: readonly OrderStatus[];
}

export async function loadKitchenOrder(input: {
  readonly kitchenId: string;
  readonly orderId: string;
}): Promise<KitchenOrderDetail | null> {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, kitchenId: input.kitchenId },
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
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          nameSnapshot: true,
          quantity: true,
          unitPriceSnapshotKobo: true,
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
          actorRole: true,
          reason: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      },
      delivery: { select: { rider: { select: { name: true } } } },
    },
  });

  if (!order) return null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    placedAt: order.placedAt,
    subtotalKobo: order.subtotalKobo,
    deliveryFeeKobo: order.deliveryFeeKobo,
    totalKobo: order.totalKobo,
    paymentMethod: order.paymentMethod,
    deliveryNotes: order.deliveryNotes,
    customer: order.customer,
    address: readAddressSnapshot(order.addressSnapshot),
    items: order.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      quantity: item.quantity,
      unitPriceKobo: item.unitPriceSnapshotKobo,
      lineTotalKobo: item.lineTotalKobo,
      notes: item.notes,
    })),
    events: order.events.map((event) => ({
      id: event.id,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actorName: event.actor?.name ?? null,
      actorRole: event.actorRole,
      reason: event.reason,
      createdAt: event.createdAt,
    })),
    riderName: order.delivery?.rider.name ?? null,
    actions: kitchenChoices(order.status),
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * The four moves that belong to the kitchen, per status.
 *
 * `CONFIRMED -> KITCHEN_ACCEPTED | KITCHEN_REJECTED`, then one step at a time to
 * `READY_FOR_PICKUP`. Every other legal edge in the domain is somebody else's:
 * the platform confirms, assigns and cancels; the rider picks up and delivers.
 */
const KITCHEN_EDGES: Readonly<Partial<Record<OrderStatus, readonly OrderStatus[]>>> = {
  CONFIRMED: ["KITCHEN_ACCEPTED", "KITCHEN_REJECTED"],
  KITCHEN_ACCEPTED: ["PREPARING"],
  PREPARING: ["READY_FOR_PICKUP"],
};

export function kitchenChoices(from: OrderStatus): readonly OrderStatus[] {
  return KITCHEN_EDGES[from] ?? [];
}

export interface KitchenTransitionInput {
  readonly orderId: string;
  readonly kitchenId: string;
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  readonly actor: { readonly userId: string };
  /** Required for a rejection; refused on every other move. */
  readonly reasonCode?: KitchenRejectionReason | null;
  /** Optional free text an operator typed, stored beside the code. */
  readonly note?: string | null;
}

/**
 * Move one of this kitchen's orders, and record who did it.
 *
 * The conditional update (`id`, `kitchenId`, `status: from`) is the race guard
 * and the ownership check in one statement: two phones acting at once cannot
 * both succeed, and an order belonging to another kitchen matches zero rows,
 * which is answered as a conflict rather than as "forbidden" - a kitchen should
 * not be able to tell a real order id from a fake one by the error it gets.
 */
export async function transitionKitchenOrder(input: KitchenTransitionInput): Promise<Date> {
  const choices = kitchenChoices(input.from);
  if (!choices.includes(input.to)) {
    throw ApiError.conflict(
      "That is not something the kitchen can do to an order in this state. Refresh the page to see where it is now.",
    );
  }

  // The domain still governs the edge; this is a second check, not a substitute.
  if (!canTransition(input.from, input.to)) {
    throw ApiError.conflict("That order cannot move there. Refresh the page.");
  }

  let reason: string | null = null;
  if (input.to === "KITCHEN_REJECTED") {
    if (!isKitchenRejectionReason(input.reasonCode)) {
      throw ApiError.badRequest("Choose a reason for rejecting the order.");
    }
    // The label is what a person reads on the timeline and in the failure log;
    // the code rides in metadata so a report can count by it.
    reason = KITCHEN_REJECTION_REASON_LABELS[input.reasonCode];
  } else if (input.reasonCode) {
    throw ApiError.badRequest("A reason only belongs on a rejection.");
  }

  try {
    assertReasonProvided(input.to, reason);
  } catch (error) {
    throw ApiError.badRequest(
      error instanceof Error ? error.message : "A reason is required for that change.",
    );
  }

  const at = new Date();
  const note = input.note?.trim() || null;

  return prisma.$transaction(async (tx) => {
    const moved = await tx.order.updateMany({
      where: {
        id: input.orderId,
        kitchenId: input.kitchenId,
        status: input.from,
      },
      data: { status: input.to, ...statusTimestamps(input.to, at) },
    });

    if (moved.count === 0) {
      throw ApiError.conflict(
        "That order moved while this page was open. Refresh to see where it is now.",
      );
    }

    await tx.orderEvent.create({
      data: {
        orderId: input.orderId,
        fromStatus: input.from,
        toStatus: input.to,
        actorUserId: input.actor.userId,
        actorRole: "kitchen_staff",
        reason,
        metadata: {
          ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
          ...(note ? { note } : {}),
        } as Prisma.InputJsonValue,
      },
    });

    return at;
  });
}
