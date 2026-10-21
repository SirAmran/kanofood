import { LOST_STATUSES } from "@kanofood/core";
import type { OrderStatus } from "@kanofood/core";
import { prisma } from "@kanofood/db";

import { lagosDayStart } from "../admin/status";
import { KITCHEN_TAB_STATUSES } from "./orders";

/**
 * The kitchen dashboard. Screen 5.2 in docs/UX_SPEC.md.
 *
 * "Sales" is the sum of order subtotals placed today, excluding the four dead
 * ends, which is the same definition the admin kitchen list uses. The delivery
 * fee is deliberately not in it: the kitchen never sees that money, and a
 * kitchen whose dashboard counts it will argue about a settlement every month.
 *
 * Everything is scoped to one kitchen. These are five small aggregates over an
 * indexed `kitchen_id`, not a loop, so the screen stays cheap enough to be the
 * one that is left open all shift.
 */

export interface KitchenDashboard {
  readonly kitchen: {
    readonly name: string;
    readonly isOpen: boolean;
    readonly isActive: boolean;
    readonly prepTimeMinutes: number | null;
  };
  readonly counts: {
    readonly new: number;
    readonly preparing: number;
    readonly ready: number;
    /** Orders the kitchen has not finished with, across all its tabs. */
    readonly live: number;
    readonly placedToday: number;
    readonly deliveredToday: number;
    readonly lostToday: number;
  };
  /** Subtotal value of today's orders that were not cancelled or failed. */
  readonly salesTodayKobo: bigint;
  /** The oldest unaccepted orders, which are the ones costing the customer time. */
  readonly queue: readonly {
    readonly id: string;
    readonly orderNumber: string;
    readonly placedAt: Date;
    readonly totalKobo: bigint;
    readonly customerName: string;
  }[];
  readonly generatedAt: Date;
}

const LIVE_STATUSES = [
  ...KITCHEN_TAB_STATUSES.new,
  ...KITCHEN_TAB_STATUSES.preparing,
  ...KITCHEN_TAB_STATUSES.ready,
] as const;

export async function loadKitchenDashboard(input: {
  readonly kitchenId: string;
  readonly now?: Date;
}): Promise<KitchenDashboard | null> {
  const now = input.now ?? new Date();
  const since = lagosDayStart(now);

  const [kitchen, liveByStatus, todayByStatus, sales, queue] = await Promise.all([
    prisma.kitchen.findUnique({
      where: { id: input.kitchenId },
      select: { name: true, isOpen: true, isActive: true, prepTimeMinutes: true },
    }),

    prisma.order.groupBy({
      by: ["status"],
      where: { kitchenId: input.kitchenId, status: { in: [...LIVE_STATUSES] } },
      _count: { _all: true },
    }),

    prisma.order.groupBy({
      by: ["status"],
      where: { kitchenId: input.kitchenId, placedAt: { gte: since } },
      _count: { _all: true },
    }),

    prisma.order.aggregate({
      where: {
        kitchenId: input.kitchenId,
        placedAt: { gte: since },
        status: { notIn: [...LOST_STATUSES] },
      },
      _sum: { subtotalKobo: true },
    }),

    prisma.order.findMany({
      where: { kitchenId: input.kitchenId, status: "CONFIRMED" },
      orderBy: { placedAt: "asc" },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        placedAt: true,
        totalKobo: true,
        customer: { select: { name: true } },
      },
    }),
  ]);

  if (!kitchen) return null;

  const live = new Map(liveByStatus.map((row) => [row.status, row._count._all]));
  const today = new Map(todayByStatus.map((row) => [row.status, row._count._all]));

  const countIn = (
    map: ReadonlyMap<OrderStatus, number>,
    statuses: readonly OrderStatus[],
  ): number => statuses.reduce((sum, status) => sum + (map.get(status) ?? 0), 0);

  const placedToday = todayByStatus.reduce((sum, row) => sum + row._count._all, 0);
  const deliveredToday = today.get("DELIVERED") ?? 0;
  const lostToday =
    (today.get("CUSTOMER_CANCELLED") ?? 0) +
    (today.get("KITCHEN_REJECTED") ?? 0) +
    (today.get("ADMIN_CANCELLED") ?? 0) +
    (today.get("DELIVERY_FAILED") ?? 0);

  return {
    kitchen,
    counts: {
      new: countIn(live, KITCHEN_TAB_STATUSES.new),
      preparing: countIn(live, KITCHEN_TAB_STATUSES.preparing),
      ready: countIn(live, KITCHEN_TAB_STATUSES.ready),
      live: liveByStatus.reduce((sum, row) => sum + row._count._all, 0),
      placedToday,
      deliveredToday,
      lostToday,
    },
    salesTodayKobo: sales._sum.subtotalKobo ?? 0n,
    queue: queue.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      placedAt: row.placedAt,
      totalKobo: row.totalKobo,
      customerName: row.customer.name,
    })),
    generatedAt: now,
  };
}
