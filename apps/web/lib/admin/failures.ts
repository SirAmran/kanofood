import { CANCELLATION_REASON_LABELS, isCancellationReason, LOST_STATUSES } from "@kanofood/core";
import type { OrderStatus } from "@kanofood/core";
import { prisma } from "@kanofood/db";

import { lagosDayStartDaysAgo } from "./status";

/**
 * Cancellations and failures. Screen 7.10.
 *
 * The four ways an order ends without food (`LOST_STATUSES` in core) and why
 * each one happened. The reason is not on the order: `orders` caches a status
 * and nothing else. It is on the `order_events` row that moved the order into
 * that state, which is the same row that records who did it and when. That is
 * the design working as intended (section 5, rule 2), and it is why this module
 * reads events rather than orders for the explanation.
 *
 * The point of the screen is not the count. It is which kitchen rejects most, and
 * whether the commonest customer reason is "wrong address" or "changed my mind",
 * because those two call for different fixes.
 */

export interface FailureOrderRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly reason: string | null;
  readonly reasonLabel: string;
  readonly actorRole: string | null;
  readonly actorName: string | null;
  readonly at: Date;
  readonly totalKobo: bigint;
  readonly kitchenId: string;
  readonly kitchenName: string;
  readonly riderName: string | null;
}

export interface ReasonTally {
  readonly reason: string;
  readonly label: string;
  readonly count: number;
  readonly amountKobo: bigint;
}

export interface ActorTally {
  readonly id: string;
  readonly name: string;
  readonly count: number;
}

export interface FailureBoard {
  readonly from: Date;
  readonly to: Date;
  readonly totalCount: number;
  readonly totalAmountKobo: bigint;
  readonly byStatus: Readonly<Record<string, number>>;
  readonly byReason: readonly ReasonTally[];
  readonly worstKitchens: readonly ActorTally[];
  readonly worstRiders: readonly ActorTally[];
  readonly orders: readonly FailureOrderRow[];
  /** Everything that ended this way, whether or not a reason was recorded. */
  readonly missingReasonCount: number;
}

function reasonLabel(reason: string | null): string {
  if (reason === null || reason === "") return "No reason recorded";
  if (isCancellationReason(reason)) return CANCELLATION_REASON_LABELS[reason];
  // A free-text reason an operator typed. Shown as written.
  return reason;
}

export async function loadFailureBoard(input: {
  readonly from: Date;
  readonly to: Date;
  readonly kitchenId?: string | null;
  readonly limit?: number;
}): Promise<FailureBoard> {
  const where = {
    status: { in: [...LOST_STATUSES] },
    kitchenId: input.kitchenId ?? undefined,
    // Filtered on placement rather than on the failure timestamp, because the
    // question is "of the orders that came in this week, how many went wrong".
    // An order placed last month and failed today belongs to last month's book.
    placedAt: { gte: input.from, lt: input.to },
  };

  const orders = await prisma.order.findMany({
    where,
    orderBy: { placedAt: "desc" },
    take: input.limit ?? 100,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalKobo: true,
      kitchenId: true,
      kitchen: { select: { name: true } },
      delivery: { select: { rider: { select: { id: true, name: true } } } },
      events: {
        // The last event is the one that ended it. Ordered descending and
        // taken one rather than filtered by status in the query, because the
        // reason belongs to the transition, not to the state.
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          reason: true,
          actorRole: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      },
    },
  });

  const [statusCounts, totals] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.order.aggregate({ where, _sum: { totalKobo: true }, _count: { _all: true } }),
  ]);

  const rows: FailureOrderRow[] = orders.map((order) => {
    const event = order.events[0];
    const reason = event?.reason ?? null;

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      reason,
      reasonLabel: reasonLabel(reason),
      actorRole: event?.actorRole ?? null,
      actorName: event?.actor?.name ?? null,
      // Falls back to the order's own placement time only if there is somehow no
      // event, which the state machine does not allow. A row with no event would
      // mean the cache and the record disagree, and the record wins.
      at: event?.createdAt ?? new Date(0),
      totalKobo: order.totalKobo,
      kitchenId: order.kitchenId,
      kitchenName: order.kitchen.name,
      riderName: order.delivery?.rider.name ?? null,
    };
  });

  // Tallies are built from the same rows the list shows, so the summary and the
  // list can never disagree. That means they cover the fetched window, not the
  // whole period, and the screen says so when the list is truncated.
  const reasonTotals = new Map<string, { count: number; amountKobo: bigint }>();
  const kitchenTotals = new Map<string, { name: string; count: number }>();
  const riderTotals = new Map<string, { name: string; count: number }>();
  let missingReasonCount = 0;

  for (const row of rows) {
    const key = row.reason ?? "";
    const existing = reasonTotals.get(key) ?? { count: 0, amountKobo: 0n };
    existing.count += 1;
    existing.amountKobo += row.totalKobo;
    reasonTotals.set(key, existing);

    if (key === "") missingReasonCount += 1;

    // Riders are tallied only for delivery failures. A rider is not at fault for
    // a customer changing their mind, and a table that says they are is a table
    // somebody will act on.
    if (row.status === "DELIVERY_FAILED" && row.riderName !== null) {
      const riderId = row.riderName;
      const tally = riderTotals.get(riderId) ?? { name: row.riderName, count: 0 };
      tally.count += 1;
      riderTotals.set(riderId, tally);
    }

    if (row.status === "KITCHEN_REJECTED") {
      const tally = kitchenTotals.get(row.kitchenId) ?? { name: row.kitchenName, count: 0 };
      tally.count += 1;
      kitchenTotals.set(row.kitchenId, tally);
    }
  }

  const byStatus: Record<string, number> = {};
  for (const row of statusCounts) byStatus[row.status] = row._count._all;

  return {
    from: input.from,
    to: input.to,
    totalCount: totals._count._all,
    totalAmountKobo: totals._sum.totalKobo ?? 0n,
    byStatus,
    byReason: [...reasonTotals.entries()]
      .map(([reason, tally]) => ({
        reason,
        label: reasonLabel(reason === "" ? null : reason),
        count: tally.count,
        amountKobo: tally.amountKobo,
      }))
      .sort((a, b) => b.count - a.count),
    worstKitchens: [...kitchenTotals.entries()]
      .map(([id, tally]) => ({ id, name: tally.name, count: tally.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    worstRiders: [...riderTotals.entries()]
      .map(([id, tally]) => ({ id, name: tally.name, count: tally.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    orders: rows,
    missingReasonCount,
  };
}

/** The default window for the screen: the last thirty Lagos days. */
export function defaultFailureWindow(now: Date = new Date()): { from: Date; to: Date } {
  return { from: lagosDayStartDaysAgo(30, now), to: lagosDayStartDaysAgo(-1, now) };
}
