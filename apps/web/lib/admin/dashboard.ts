import { prisma } from "@kanofood/db";
import { ACTIVE_STATUSES } from "@kanofood/core";

import { lagosDayStart, lagosDayStartDaysAgo } from "./status";

/**
 * The dashboard read.
 *
 * Screen 7.2. What is happening right now, in one round of queries rather than
 * one per tile: this is the first screen an operator opens and it is opened
 * dozens of times a shift, so it runs as a handful of aggregates rather than a
 * loop over statuses.
 *
 * Everything here is derived at read time. The schema stores no cached totals
 * (section 5 of ARCHITECTURE is explicit about that), so the numbers cannot
 * disagree with the rows they came from.
 */

export interface DashboardCounts {
  /** Orders in a state that is still moving. */
  readonly live: number;
  /** Orders waiting for a human to telephone the customer. The queue that matters. */
  readonly awaitingConfirmation: number;
  /** Placed since midnight in Kano. */
  readonly placedToday: number;
  readonly deliveredToday: number;
  readonly cancelledToday: number;
  readonly failedToday: number;
}

export interface QueueRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly kitchenName: string;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly totalKobo: bigint;
  readonly placedAt: Date;
  readonly itemCount: number;
}

export interface CashPosition {
  /** Cash a rider has collected and not yet handed over. */
  readonly heldByRidersKobo: bigint;
  /** Handed over and not yet counted by the office. */
  readonly awaitingCountKobo: bigint;
  readonly outstandingKobo: bigint;
  readonly ridersHoldingCash: number;
}

export interface NetworkPosition {
  readonly kitchensTotal: number;
  readonly kitchensOpen: number;
  readonly ridersTotal: number;
  readonly ridersAvailable: number;
  readonly ridersBusy: number;
}

export interface DashboardData {
  readonly counts: DashboardCounts;
  /** Oldest first: the order that has been waiting longest is the one to call. */
  readonly queue: readonly QueueRow[];
  readonly cash: CashPosition;
  readonly network: NetworkPosition;
  /** Cash collected today, across every method that has been marked collected. */
  readonly collectedTodayKobo: bigint;
  /** Gross value of orders placed today, before anything is deducted. */
  readonly grossTodayKobo: bigint;
  readonly generatedAt: Date;
}

export async function loadDashboard(now: Date = new Date()): Promise<DashboardData> {
  const todayStart = lagosDayStart(now);

  const [
    liveByStatus,
    placedToday,
    todayByStatus,
    queueRows,
    heldByRiders,
    awaitingCount,
    ridersHoldingCash,
    kitchensTotal,
    kitchensOpen,
    ridersTotal,
    ridersAvailable,
    ridersBusy,
    collectedToday,
    grossToday,
  ] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      where: { status: { in: [...ACTIVE_STATUSES] } },
      _count: { _all: true },
    }),

    prisma.order.count({ where: { placedAt: { gte: todayStart } } }),

    prisma.order.groupBy({
      by: ["status"],
      where: { placedAt: { gte: todayStart } },
      _count: { _all: true },
    }),

    prisma.order.findMany({
      where: { status: "PENDING_CONFIRMATION" },
      orderBy: { placedAt: "asc" },
      take: 25,
      select: {
        id: true,
        orderNumber: true,
        totalKobo: true,
        placedAt: true,
        kitchen: { select: { name: true } },
        customer: { select: { name: true, phone: true } },
        _count: { select: { items: true } },
      },
    }),

    prisma.cashCollection.aggregate({
      _sum: { amountKobo: true },
      where: { status: "pending" },
    }),

    prisma.cashCollection.aggregate({
      _sum: { amountKobo: true },
      where: { status: "handed_over" },
    }),

    prisma.cashCollection.groupBy({
      by: ["riderId"],
      where: { status: { in: ["pending", "handed_over"] } },
    }),

    prisma.kitchen.count(),
    prisma.kitchen.count({ where: { isOpen: true, isActive: true } }),
    prisma.rider.count({ where: { isActive: true } }),
    prisma.rider.count({ where: { isActive: true, isAvailable: true } }),

    // A rider is busy when they hold a delivery that has not finished. Counted
    // from `deliveries` rather than from order status, because this is a
    // question about a person, not about an order.
    prisma.delivery.count({
      where: { deliveredAt: null, failedAt: null },
    }),

    prisma.payment.aggregate({
      _sum: { amountKobo: true },
      where: { collectedAt: { gte: todayStart } },
    }),

    prisma.order.aggregate({
      _sum: { totalKobo: true },
      where: { placedAt: { gte: todayStart } },
    }),
  ]);

  // Tallied from the grouped rows rather than fetched as three separate counts.
  // The database has already done the work; this just folds one row per status
  // into the four buckets the screen needs.
  let deliveredToday = 0;
  let cancelledToday = 0;
  let failedToday = 0;

  for (const row of todayByStatus) {
    switch (row.status) {
      case "DELIVERED":
        deliveredToday += row._count._all;
        break;
      // Three different ends, one number: an order that never reached the
      // customer. Which of the three it was is what the cancellations screen is
      // for, not the dashboard.
      case "CUSTOMER_CANCELLED":
      case "KITCHEN_REJECTED":
      case "ADMIN_CANCELLED":
        cancelledToday += row._count._all;
        break;
      case "DELIVERY_FAILED":
        failedToday += row._count._all;
        break;
      default:
        break;
    }
  }

  const counts: DashboardCounts = {
    live: liveByStatus.reduce((total, row) => total + row._count._all, 0),
    awaitingConfirmation:
      liveByStatus.find((row) => row.status === "PENDING_CONFIRMATION")?._count._all ?? 0,
    placedToday,
    deliveredToday,
    cancelledToday,
    failedToday,
  };

  const heldKobo = heldByRiders._sum.amountKobo ?? 0n;
  const awaitingKobo = awaitingCount._sum.amountKobo ?? 0n;

  return {
    counts,
    queue: queueRows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      kitchenName: row.kitchen.name,
      customerName: row.customer.name,
      customerPhone: row.customer.phone,
      totalKobo: row.totalKobo,
      placedAt: row.placedAt,
      itemCount: row._count.items,
    })),
    cash: {
      heldByRidersKobo: heldKobo,
      awaitingCountKobo: awaitingKobo,
      outstandingKobo: heldKobo + awaitingKobo,
      ridersHoldingCash: ridersHoldingCash.length,
    },
    network: {
      kitchensTotal,
      kitchensOpen,
      ridersTotal,
      ridersAvailable,
      ridersBusy,
    },
    collectedTodayKobo: collectedToday._sum.amountKobo ?? 0n,
    grossTodayKobo: grossToday._sum.totalKobo ?? 0n,
    generatedAt: now,
  };
}

export interface TrendPoint {
  readonly day: Date;
  readonly orders: number;
  readonly grossKobo: bigint;
}

/**
 * Orders and gross value per day, for the dashboard sparkline and the analytics
 * screen.
 *
 * Grouped in Postgres rather than in Node, and grouped on the Lagos day rather
 * than on the UTC one. `date_trunc` with a timezone argument is the only place
 * in this codebase that raw SQL is used for a read, and it is used because the
 * alternative is fetching every row in the window to bucket it.
 */
export async function loadTrend(days = 7, now: Date = new Date()): Promise<readonly TrendPoint[]> {
  const from = lagosDayStartDaysAgo(days - 1, now);

  /**
   * The casts are not decoration.
   *
   * `count(*)` is bigint and `sum(bigint)` is numeric in Postgres, and Prisma
   * hands numeric back as a Decimal object rather than a BigInt. Casting both to
   * a text and an int at the database is the difference between exact arithmetic
   * and a value that happens to convert correctly today.
   */
  const rows = await prisma.$queryRaw<{ day: Date; orders: number; gross: string }[]>`
    SELECT
      date_trunc('day', placed_at AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos' AS day,
      count(*)::int AS orders,
      coalesce(sum(total_kobo), 0)::text AS gross
    FROM orders
    WHERE placed_at >= ${from}
    GROUP BY 1
    ORDER BY 1
  `;

  return rows.map((row) => ({
    day: row.day,
    orders: row.orders,
    grossKobo: BigInt(row.gross),
  }));
}
