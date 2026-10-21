import { LOST_STATUSES } from "@kanofood/core";
import type { Kobo, OrderStatus } from "@kanofood/core";
import { prisma } from "@kanofood/db";

import { lagosDayStartDaysAgo } from "../admin/status";

/**
 * The kitchen's own numbers. Screen 5.8 in docs/UX_SPEC.md.
 *
 * Three windows, one read each: today, the last seven days, the last thirty.
 * The arithmetic is the same as the admin analytics screen, with a kitchen
 * filter added and the platform's revenue left out, because a kitchen has no
 * business being shown the delivery fee or the commission line.
 *
 * **Sell-through** is `delivered / placed` for the window: of the orders that
 * came in, how many the kitchen cooked and sent out. An order still moving at
 * the moment the screen is read counts as neither delivered nor lost, which is
 * why the figure is slightly pessimistic during service rather than
 * artificially flattered by a day that has not finished.
 *
 * **Average order value** is the delivered subtotal divided by delivered orders,
 * matching the admin definition, so the two screens never quote a kitchen two
 * different numbers.
 */

export type KitchenAnalyticsRange = "today" | "week" | "month";

export const KITCHEN_ANALYTICS_RANGES: readonly {
  readonly key: KitchenAnalyticsRange;
  readonly label: string;
}[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Last 7 days" },
  { key: "month", label: "Last 30 days" },
];

export function isKitchenAnalyticsRange(value: unknown): value is KitchenAnalyticsRange {
  return value === "today" || value === "week" || value === "month";
}

export function rangeWindow(
  range: KitchenAnalyticsRange,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const daysBack = range === "today" ? 0 : range === "week" ? 6 : 29;
  return { from: lagosDayStartDaysAgo(daysBack, now), to: now };
}

/** The most orders one range will read. */
const MAX_ROWS = 20_000;

export interface KitchenAnalyticsDay {
  /** Lagos date, `YYYY-MM-DD`. */
  readonly day: string;
  readonly placed: number;
  readonly delivered: number;
  readonly lost: number;
  readonly foodKobo: Kobo;
}

export interface KitchenAnalytics {
  readonly range: KitchenAnalyticsRange;
  readonly from: Date;
  readonly to: Date;
  readonly truncated: boolean;
  readonly totals: {
    readonly placed: number;
    readonly delivered: number;
    readonly lost: number;
    readonly live: number;
    /** Subtotal of delivered orders: what the kitchen earned. */
    readonly foodKobo: Kobo;
    readonly averageOrderKobo: Kobo;
    readonly sellThrough: number;
    readonly lossRate: number;
  };
  readonly days: readonly KitchenAnalyticsDay[];
  readonly items: readonly {
    readonly name: string;
    readonly quantity: number;
    readonly revenueKobo: Kobo;
  }[];
}

function lagosDayKey(value: Date): string {
  return new Date(value.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function loadKitchenAnalytics(input: {
  readonly kitchenId: string;
  readonly range: KitchenAnalyticsRange;
  readonly now?: Date;
}): Promise<KitchenAnalytics> {
  const { from, to } = rangeWindow(input.range, input.now ?? new Date());

  const orders = await prisma.order.findMany({
    where: { kitchenId: input.kitchenId, placedAt: { gte: from, lte: to } },
    orderBy: { placedAt: "asc" },
    take: MAX_ROWS + 1,
    select: { status: true, placedAt: true, subtotalKobo: true },
  });

  const truncated = orders.length > MAX_ROWS;
  if (truncated) orders.length = MAX_ROWS;

  const lost = new Set<OrderStatus>(LOST_STATUSES);
  type DayAcc = { -readonly [K in keyof KitchenAnalyticsDay]: KitchenAnalyticsDay[K] };
  const byDay = new Map<string, DayAcc>();

  let delivered = 0;
  let lostCount = 0;
  let live = 0;
  let foodKobo = 0n;

  for (const order of orders) {
    const key = lagosDayKey(order.placedAt);
    const day =
      byDay.get(key) ?? { day: key, placed: 0, delivered: 0, lost: 0, foodKobo: 0n };

    day.placed += 1;

    if (order.status === "DELIVERED") {
      delivered += 1;
      foodKobo += order.subtotalKobo;
      day.delivered += 1;
      day.foodKobo += order.subtotalKobo;
    } else if (lost.has(order.status)) {
      lostCount += 1;
      day.lost += 1;
    } else {
      live += 1;
    }

    byDay.set(key, day);
  }

  const lines = await prisma.orderItem.groupBy({
    by: ["nameSnapshot"],
    where: {
      order: {
        kitchenId: input.kitchenId,
        status: "DELIVERED",
        placedAt: { gte: from, lte: to },
      },
    },
    _sum: { quantity: true, lineTotalKobo: true },
  });

  const placed = orders.length;

  return {
    range: input.range,
    from,
    to,
    truncated,
    totals: {
      placed,
      delivered,
      lost: lostCount,
      live,
      foodKobo,
      averageOrderKobo: delivered === 0 ? 0n : foodKobo / BigInt(delivered),
      sellThrough: placed === 0 ? 0 : delivered / placed,
      lossRate: placed === 0 ? 0 : lostCount / placed,
    },
    days: [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1)),
    items: lines
      .map((line) => ({
        name: line.nameSnapshot,
        quantity: line._sum.quantity ?? 0,
        revenueKobo: line._sum.lineTotalKobo ?? 0n,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10),
  };
}
