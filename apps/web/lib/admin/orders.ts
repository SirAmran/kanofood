import { ApiError } from "../api/http";
import { assertReasonProvided, canTransition, isTerminal } from "@kanofood/core";
import type { OrderStatus } from "@kanofood/core";
import { Prisma, prisma } from "@kanofood/db";


import { statusTimestamps } from "../order-timestamps";
import { lagosDayStartDaysAgo } from "./status";

/**
 * Who is acting, as far as this module cares.
 *
 * Narrower than `AdminActor` on purpose: the only thing written to the event is
 * the user id, and the only other thing read is a name for a metadata note. A
 * service that demanded the full page-side actor would be unusable from the API
 * route, which has an `Actor` and no reason to fetch a name it does not need.
 */
export interface OrderActor {
  readonly userId: string;
  readonly name?: string;
}

/**
 * Orders: the read, and the write path that moves one.
 *
 * This is the heart of the admin interface. Orders 7.3 and 7.4, and the write
 * half of every other screen that touches an order.
 *
 * Three rules govern the write path, and they are the reason it is not a plain
 * `update`:
 *
 *   1. **The transition table decides.** `canTransition` from
 *      `@kanofood/core` is the only thing that authorises a move. Nothing here
 *      re-states an edge, so a fourteenth status or a changed edge lands in one
 *      place.
 *   2. **The event is the record.** `order_events` is append-only and
 *      `orders.status` is a cache of it (schema comment on `OrderEvent`). Every
 *      move writes an event in the same transaction as the status, so the two
 *      cannot disagree.
 *   3. **The move is conditional.** The update carries `status: from` in its
 *      `where`, so two operators acting on the same order at the same moment
 *      cannot both succeed. The second one gets a conflict rather than silently
 *      overwriting the first.
 */

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface OrderListFilters {
  readonly statuses?: readonly OrderStatus[];
  readonly kitchenId?: string;
  readonly riderId?: string;
  readonly from?: Date;
  readonly to?: Date;
  /** An order number, a customer name, or a phone number. */
  readonly q?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface OrderListRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly totalKobo: bigint;
  readonly paymentMethod: "cod" | "transfer" | "card";
  readonly placedAt: Date;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly kitchenName: string;
  readonly riderName: string | null;
  readonly itemCount: number;
}

export interface OrderListResult {
  readonly rows: readonly OrderListRow[];
  readonly total: number;
  readonly page: number;
  readonly pageCount: number;
  readonly pageSize: number;
  /**
   * How many orders sit in each status under the *other* filters, ignoring the
   * status filter itself.
   *
   * That caveat is the whole point. Counting with the status filter applied
   * would show one non-zero number and zeros everywhere else, which is a strip
   * that tells an operator nothing. Counting without it means the tab strip says
   * "there are 4 waiting for a call and 11 in flight", which is the question the
   * strip is being read to answer.
   */
  readonly statusCounts: Readonly<Partial<Record<OrderStatus, number>>>;
}

export const DEFAULT_PAGE_SIZE = 25;

function buildWhere(filters: OrderListFilters, options: { applyStatus?: boolean } = {}): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};

  if (options.applyStatus !== false && filters.statuses && filters.statuses.length > 0) {
    where.status = { in: [...filters.statuses] };
  }
  if (filters.kitchenId) where.kitchenId = filters.kitchenId;

  // Through the delivery, because a rider is on an order via the delivery row
  // rather than a column on the order. An order with no delivery is excluded
  // when a rider is asked for, which is correct: it is not that rider's order.
  if (filters.riderId) where.delivery = { is: { riderId: filters.riderId } };

  if (filters.from ?? filters.to) {
    where.placedAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  const term = filters.q?.trim();
  if (term) {
    // Case-insensitive contains on the three things an operator has in front of
    // them when they are looking for an order: the number off the receipt, the
    // name, and the number they just dialled.
    where.OR = [
      { orderNumber: { contains: term, mode: "insensitive" } },
      { customer: { name: { contains: term, mode: "insensitive" } } },
      { customer: { phone: { contains: term } } },
    ];
  }

  return where;
}

export async function listOrders(filters: OrderListFilters): Promise<OrderListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
  const where = buildWhere(filters);
  // The same filters with the status left off, so the tab strip can count what
  // each tab would show rather than what the open tab already shows.
  const countWhere = buildWhere(filters, { applyStatus: false });

  const [total, rows, grouped] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalKobo: true,
        paymentMethod: true,
        placedAt: true,
        customer: { select: { name: true, phone: true } },
        kitchen: { select: { name: true } },
        delivery: { select: { rider: { select: { name: true } } } },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: countWhere,
      _count: { _all: true },
    }),
  ]);

  const statusCounts: Partial<Record<OrderStatus, number>> = {};
  for (const group of grouped) {
    statusCounts[group.status] = group._count._all;
  }

  return {
    rows: rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.status,
      totalKobo: row.totalKobo,
      paymentMethod: row.paymentMethod,
      placedAt: row.placedAt,
      customerName: row.customer.name,
      customerPhone: row.customer.phone,
      kitchenName: row.kitchen.name,
      riderName: row.delivery?.rider.name ?? null,
      itemCount: row._count.items,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
    statusCounts,
  };
}

export interface OrderDetailItem {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceKobo: bigint;
  readonly lineTotalKobo: bigint;
  readonly notes: string | null;
  /** False when the menu item behind this line has since been removed. */
  readonly menuItemExists: boolean;
}

export interface OrderDetailEvent {
  readonly id: string;
  readonly fromStatus: OrderStatus | null;
  readonly toStatus: OrderStatus;
  readonly actorName: string | null;
  readonly actorRole: string | null;
  readonly reason: string | null;
  readonly createdAt: Date;
}

export interface OrderDetailPayment {
  readonly id: string;
  readonly method: "cod" | "transfer" | "card";
  readonly amountKobo: bigint;
  readonly status: "pending" | "collected" | "reconciled" | "failed";
  readonly collectedAt: Date | null;
  readonly reconciledAt: Date | null;
}

export interface OrderDetail {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly placedAt: Date;
  readonly updatedAt: Date;
  readonly subtotalKobo: bigint;
  readonly deliveryFeeKobo: bigint;
  readonly discountKobo: bigint;
  readonly totalKobo: bigint;
  readonly paymentMethod: "cod" | "transfer" | "card";
  readonly deliveryNotes: string | null;
  readonly addressSnapshot: unknown;
  readonly customer: { readonly id: string; readonly name: string; readonly phone: string };
  readonly kitchen: { readonly id: string; readonly name: string; readonly phone: string | null };
  readonly items: readonly OrderDetailItem[];
  readonly events: readonly OrderDetailEvent[];
  readonly payments: readonly OrderDetailPayment[];
  readonly delivery: {
    readonly id: string;
    readonly riderId: string;
    readonly riderName: string;
    readonly riderPhone: string;
    readonly assignedAt: Date;
    readonly pickedUpAt: Date | null;
    readonly deliveredAt: Date | null;
    readonly failedAt: Date | null;
    readonly failureReason: string | null;
  } | null;
  /** Which moves the transition table allows from here. Empty means terminal. */
  readonly allowedNext: readonly OrderStatus[];
}

export async function loadOrder(id: string): Promise<OrderDetail | null> {
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      placedAt: true,
      updatedAt: true,
      subtotalKobo: true,
      deliveryFeeKobo: true,
      discountKobo: true,
      totalKobo: true,
      paymentMethod: true,
      deliveryNotes: true,
      addressSnapshot: true,
      customer: { select: { id: true, name: true, phone: true } },
      kitchen: { select: { id: true, name: true, phone: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          nameSnapshot: true,
          quantity: true,
          unitPriceSnapshotKobo: true,
          lineTotalKobo: true,
          notes: true,
          menuItemId: true,
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
      payments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          method: true,
          amountKobo: true,
          status: true,
          collectedAt: true,
          reconciledAt: true,
        },
      },
      delivery: {
        select: {
          id: true,
          riderId: true,
          assignedAt: true,
          pickedUpAt: true,
          deliveredAt: true,
          failedAt: true,
          failureReason: true,
          rider: { select: { name: true, phone: true } },
        },
      },
    },
  });

  if (!order) return null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    placedAt: order.placedAt,
    updatedAt: order.updatedAt,
    subtotalKobo: order.subtotalKobo,
    deliveryFeeKobo: order.deliveryFeeKobo,
    discountKobo: order.discountKobo,
    totalKobo: order.totalKobo,
    paymentMethod: order.paymentMethod,
    deliveryNotes: order.deliveryNotes,
    addressSnapshot: order.addressSnapshot,
    customer: order.customer,
    kitchen: order.kitchen,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      quantity: item.quantity,
      unitPriceKobo: item.unitPriceSnapshotKobo,
      lineTotalKobo: item.lineTotalKobo,
      notes: item.notes,
      menuItemExists: item.menuItemId !== null,
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
    payments: order.payments,
    delivery: order.delivery
      ? {
          id: order.delivery.id,
          riderId: order.delivery.riderId,
          riderName: order.delivery.rider.name,
          riderPhone: order.delivery.rider.phone,
          assignedAt: order.delivery.assignedAt,
          pickedUpAt: order.delivery.pickedUpAt,
          deliveredAt: order.delivery.deliveredAt,
          failedAt: order.delivery.failedAt,
          failureReason: order.delivery.failureReason,
        }
      : null,
    allowedNext: allowedNextStatuses(order.status),
  };
}

function allowedNextStatuses(from: OrderStatus): readonly OrderStatus[] {
  const ALL: readonly OrderStatus[] = [
    "PENDING_CONFIRMATION",
    "CONFIRMED",
    "KITCHEN_ACCEPTED",
    "PREPARING",
    "READY_FOR_PICKUP",
    "RIDER_ASSIGNED",
    "PICKED_UP",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CUSTOMER_CANCELLED",
    "KITCHEN_REJECTED",
    "ADMIN_CANCELLED",
    "DELIVERY_FAILED",
  ];

  // Filtered from the real table rather than listed, so a change to the
  // transition table changes what the screen offers with no edit here.
  return ALL.filter((to) => canTransition(from, to));
}

/** What an admin may do from here. The customer-only edges are not offered. */
export function adminChoices(from: OrderStatus): readonly OrderStatus[] {
  return allowedNextStatuses(from).filter((to) => to !== "CUSTOMER_CANCELLED");
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export interface TransitionInput {
  readonly orderId: string;
  /** The status the caller believes the order is in. */
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  readonly actor: OrderActor;
  /** Stored on the event. Required by the domain for two of the ends. */
  readonly reason?: string | null;
  /** Anything else worth keeping: who was telephoned, and when. */
  readonly metadata?: Record<string, unknown> | null;
  /** Kept in step with the delivery row when one exists. */
  readonly at?: Date;
}

/**
 * Move an order, and record it.
 *
 * `from` is supplied by the caller rather than read here, and that is what makes
 * the move safe: the update is conditional on the order still being in that
 * state, so a page that was open while someone else acted gets a conflict
 * instead of overwriting them. The caller reads `from` off the page it rendered.
 */
export async function transitionOrder(input: TransitionInput): Promise<Date> {
  if (!canTransition(input.from, input.to)) {
    throw ApiError.conflict(
      `An order cannot go from ${input.from} to ${input.to}. Refresh the page to see where it is now.`,
    );
  }

  // The domain decides whether a reason is required, not this file.
  try {
    assertReasonProvided(input.to, input.reason);
  } catch (error) {
    throw ApiError.badRequest(
      error instanceof Error ? error.message : "A reason is required for that change.",
    );
  }

  const at = input.at ?? new Date();

  return prisma.$transaction(async (tx) => {
    const moved = await tx.order.updateMany({
      // The guard. Not decoration: this is the only thing preventing two
      // operators from both acting on the same order.
      where: { id: input.orderId, status: input.from },
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
        actorRole: "admin",
        reason: input.reason?.trim() ?? null,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    // The delivery row mirrors the order's own timestamps so the two never
    // disagree about when a rider picked something up.
    if (input.to === "PICKED_UP" || input.to === "DELIVERED" || input.to === "DELIVERY_FAILED") {
      const deliveryAt =
        input.to === "PICKED_UP"
          ? { pickedUpAt: at }
          : input.to === "DELIVERED"
            ? { deliveredAt: at, outForDeliveryAt: at }
            : { failedAt: at, failureReason: input.reason?.trim() ?? null };

      await tx.delivery.updateMany({
        where: { orderId: input.orderId },
        data: deliveryAt,
      });
    }

    return at;
  });
}

/**
 * Put a rider on an order.
 *
 * Assignment and the move to `RIDER_ASSIGNED` happen together or not at all: an
 * order claiming a rider it does not have, or a delivery pointing at an order
 * still waiting for one, are both worse than a failed request.
 *
 * The rider's `isAvailable` flag is deliberately not touched. That flag is the
 * rider's own switch for going on and off shift; whether they are currently
 * carrying something is derived from unfinished deliveries, which is what the
 * dashboard counts. Overloading the two would make a rider's own "go offline"
 * mean "I am on a delivery".
 */
export async function assignRider(input: {
  readonly orderId: string;
  readonly riderId: string;
  readonly actor: OrderActor;
}): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { status: true, delivery: { select: { id: true } } },
  });

  if (!order) throw ApiError.notFound("That order no longer exists.");
  if (order.delivery) {
    throw ApiError.conflict("That order already has a rider on it.");
  }
  if (!canTransition(order.status, "RIDER_ASSIGNED")) {
    throw ApiError.conflict(
      `A rider can only be assigned once an order is ready for pickup. This one is ${order.status}.`,
    );
  }

  const rider = await prisma.rider.findUnique({
    where: { id: input.riderId },
    select: { id: true, isActive: true, name: true },
  });

  if (!rider) throw ApiError.notFound("That rider no longer exists.");
  if (!rider.isActive) {
    throw ApiError.conflict(`${rider.name} is not an active rider.`);
  }

  const at = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.delivery.create({
      data: { orderId: input.orderId, riderId: input.riderId, assignedAt: at },
    });

    const moved = await tx.order.updateMany({
      where: { id: input.orderId, status: order.status },
      data: { status: "RIDER_ASSIGNED", riderAssignedAt: at },
    });

    if (moved.count === 0) {
      // Something moved the order between the read above and here. Rolling back
      // takes the delivery row with it.
      throw ApiError.conflict(
        "That order moved while this page was open. Refresh to see where it is now.",
      );
    }

    await tx.orderEvent.create({
      data: {
        orderId: input.orderId,
        fromStatus: order.status,
        toStatus: "RIDER_ASSIGNED",
        actorUserId: input.actor.userId,
        actorRole: "admin",
        metadata: { riderId: rider.id, riderName: rider.name },
      },
    });
  });
}

/** Whether this order can still be moved at all. Terminal states cannot. */
export function canMove(status: OrderStatus): boolean {
  return !isTerminal(status) && allowedNextStatuses(status).length > 0;
}

/** The window the orders list defaults to when no dates are given. */
export function defaultWindow(now: Date = new Date()): { from: Date; to: Date } {
  const from = lagosDayStartDaysAgo(6, now);
  return { from, to: now };
}
