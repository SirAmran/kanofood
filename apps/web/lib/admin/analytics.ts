import { LOST_STATUSES } from "@kanofood/core";
import type { Kobo, OrderStatus } from "@kanofood/core";
import { prisma } from "@kanofood/db";

import { lagosDayStartDaysAgo } from "./status";

/**
 * Analytics. Screen 7.11.
 *
 * Every figure here is derived from orders, never stored. Section 5 is explicit
 * that nothing caches a total, and the reason shows up on this screen more than
 * anywhere else: a dashboard reading a cached daily total is wrong for as long
 * as it takes something else to update it, and a dashboard that is sometimes
 * wrong is a dashboard nobody trusts twice.
 *
 * **How it aggregates.** One query fetches the window's orders, narrow, and the
 * folding happens in JavaScript. The alternative is thirty round trips, one per
 * day, or hand-written SQL with `date_trunc` and a Lagos offset in it. Neither
 * is better: a day-by-day loop is slow on this machine, and a timezone
 * expression in raw SQL is a second place the Lagos offset lives, which is
 * exactly the duplication that produced the bug `lagosDayStart` exists to
 * prevent. The fetch is capped, and the screen reports when the cap was hit
 * rather than quietly averaging a truncated set.
 */

/** The most orders one analytics query will read. */
const MAX_ROWS = 20_000;

export interface DaySeries {
  /** Lagos date, `YYYY-MM-DD`. */
  readonly day: string;
  readonly placed: number;
  readonly delivered: number;
  readonly lost: number;
  readonly live: number;
  /** Sum of subtotals on delivered orders: what the kitchens earned. */
  readonly foodKobo: Kobo;
  /** Sum of delivery fees on delivered orders: what the platform earned. */
  readonly deliveryKobo: Kobo;
  /** Sum of totals on orders that were not lost, whatever their state. */
  readonly bookedKobo: Kobo;
  readonly commissionKobo: Kobo;
}

export interface RankedKitchen {
  readonly id: string;
  readonly name: string;
  readonly orders: number;
  readonly delivered: number;
  readonly lost: number;
  readonly foodKobo: Kobo;
  readonly commissionKobo: Kobo;
}

export interface RankedItem {
  readonly name: string;
  readonly quantity: number;
  readonly revenueKobo: Kobo;
}

export interface Analytics {
  readonly from: Date;
  readonly to: Date;
  readonly truncated: boolean;
  readonly days: readonly DaySeries[];
  readonly totals: {
    readonly placed: number;
    readonly delivered: number;
    readonly lost: number;
    readonly live: number;
    readonly foodKobo: Kobo;
    readonly deliveryKobo: Kobo;
    readonly bookedKobo: Kobo;
    readonly commissionKobo: Kobo;
    readonly averageOrderKobo: Kobo;
    readonly completionRate: number;
    readonly lossRate: number;
    readonly newCustomers: number;
    readonly returningCustomers: number;
  };
  readonly kitchens: readonly RankedKitchen[];
  readonly items: readonly RankedItem[];
  readonly delivery: {
    readonly count: number;
    readonly medianMinutes: number | null;
    readonly slowestMinutes: number | null;
  };
}

/** `YYYY-MM-DD` in Lagos, for bucketing. */
function lagosDayKey(value: Date): string {
  return new Date(value.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function loadAnalytics(input: {
  readonly from: Date;
  readonly to: Date;
}): Promise<Analytics> {
  const orders = await prisma.order.findMany({
    where: { placedAt: { gte: input.from, lt: input.to } },
    orderBy: { placedAt: "asc" },
    take: MAX_ROWS + 1,
    select: {
      id: true,
      status: true,
      placedAt: true,
      customerId: true,
      kitchenId: true,
      subtotalKobo: true,
      deliveryFeeKobo: true,
      totalKobo: true,
      kitchen: { select: { name: true, commissionRate: true } },
      delivery: {
        select: { assignedAt: true, deliveredAt: true },
      },
    },
  });

  const truncated = orders.length > MAX_ROWS;
  if (truncated) orders.length = MAX_ROWS;

  // A customer is "new" if their first order is inside the window. One query for
  // the earliest order per customer, restricted to the customers in the window.
  const customerIds = [...new Set(orders.map((order) => order.customerId))];
  const earliest = await prisma.order.groupBy({
    by: ["customerId"],
    where: { customerId: { in: customerIds } },
    _min: { placedAt: true },
  });
  const firstSeen = new Map(earliest.map((row) => [row.customerId, row._min.placedAt]));

  const lost = new Set<OrderStatus>(LOST_STATUSES);

  // Mutably accumulated, then frozen into the readonly shapes on the way out.
  // The exported interfaces are readonly because a caller must not edit a figure
  // after it has been computed; that has to happen somewhere, and it happens
  // here rather than by loosening the types everybody else sees.
  type DayAcc = { -readonly [K in keyof DaySeries]: DaySeries[K] };
  type KitchenAcc = { -readonly [K in keyof RankedKitchen]: RankedKitchen[K] };

  const byDay = new Map<string, DayAcc>();
  const byKitchen = new Map<string, KitchenAcc>();
  const durations: number[] = [];

  let delivered = 0;
  let lostCount = 0;
  let live = 0;
  let foodKobo = 0n;
  let deliveryKobo = 0n;
  let bookedKobo = 0n;
  let commissionKobo = 0n;
  let newCustomers = 0;
  let returningCustomers = 0;

  for (const order of orders) {
    const key = lagosDayKey(order.placedAt);
    const day =
      byDay.get(key) ??
      {
        day: key,
        placed: 0,
        delivered: 0,
        lost: 0,
        live: 0,
        foodKobo: 0n,
        deliveryKobo: 0n,
        bookedKobo: 0n,
        commissionKobo: 0n,
      };

    const isLost = lost.has(order.status);
    const isDelivered = order.status === "DELIVERED";

    // Commission is computed per order at the kitchen's current rate rather than
    // read from a settlement, because a settlement is a period and this is a
    // running figure. The two will differ for a kitchen whose rate changed
    // mid-period, and that is correct: this is "what the rate says today".
    const rate = order.kitchen.commissionRate;
    const basisPoints = rate === null ? 0 : Math.round(rate.toNumber() * 10_000);
    const commission = (order.subtotalKobo * BigInt(basisPoints) + 5_000n) / 10_000n;

    day.placed += 1;
    if (isDelivered) {
      day.delivered += 1;
      day.foodKobo += order.subtotalKobo;
      day.deliveryKobo += order.deliveryFeeKobo;
      day.commissionKobo += commission;
    } else if (isLost) {
      day.lost += 1;
    } else {
      day.live += 1;
    }
    if (!isLost) day.bookedKobo += order.totalKobo;
    byDay.set(key, day);

    const kitchen =
      byKitchen.get(order.kitchenId) ??
      {
        id: order.kitchenId,
        name: order.kitchen.name,
        orders: 0,
        delivered: 0,
        lost: 0,
        foodKobo: 0n,
        commissionKobo: 0n,
      };
    kitchen.orders += 1;
    if (isDelivered) {
      kitchen.delivered += 1;
      kitchen.foodKobo += order.subtotalKobo;
      kitchen.commissionKobo += commission;
    } else if (isLost) {
      kitchen.lost += 1;
    }
    byKitchen.set(order.kitchenId, kitchen);

    if (isDelivered) {
      delivered += 1;
      foodKobo += order.subtotalKobo;
      deliveryKobo += order.deliveryFeeKobo;
      commissionKobo += commission;
    } else if (isLost) {
      lostCount += 1;
    } else {
      live += 1;
    }
    if (!isLost) bookedKobo += order.totalKobo;

    const first = firstSeen.get(order.customerId);
    if (first) {
      if (first >= input.from && first < input.to) newCustomers += 1;
      else returningCustomers += 1;
    }

    const delivery = order.delivery;
    if (delivery?.deliveredAt) {
      durations.push(
        Math.max(
          0,
          Math.round((delivery.deliveredAt.getTime() - delivery.assignedAt.getTime()) / 60_000),
        ),
      );
    }
  }

  // Top items are read separately, restricted to delivered orders in the
  // window. A relation filter rather than a list of order ids: the window can
  // hold thousands of orders, and an `IN` clause that long is a query somebody
  // has to debug at the worst moment.
  const items = await topItems(input);

  durations.sort((a, b) => a - b);

  const placed = orders.length;

  return {
    from: input.from,
    to: input.to,
    truncated,
    days: [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1)),
    totals: {
      placed,
      delivered,
      lost: lostCount,
      live,
      foodKobo,
      deliveryKobo,
      bookedKobo,
      commissionKobo,
      averageOrderKobo: delivered === 0 ? 0n : foodKobo / BigInt(delivered),
      completionRate: placed === 0 ? 0 : delivered / placed,
      lossRate: placed === 0 ? 0 : lostCount / placed,
      newCustomers,
      returningCustomers,
    },
    kitchens: [...byKitchen.values()].sort((a, b) => b.orders - a.orders),
    items,
    delivery: {
      count: durations.length,
      medianMinutes: median(durations),
      slowestMinutes: durations.length === 0 ? null : (durations[durations.length - 1] ?? null),
    },
  };
}

function median(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const low = sorted[middle - 1] ?? 0;
  const high = sorted[middle] ?? 0;
  return Math.round((low + high) / 2);
}

/**
 * What sold, by name.
 *
 * Grouped on `name_snapshot` rather than on `menu_item_id`, and that is the
 * right key here even though it looks like the wrong one: the id is null for an
 * item that has since been deleted (`onDelete: SetNull`), and a bestseller list
 * that loses a dish the moment the kitchen stops selling it is not a bestseller
 * list. The name is a snapshot of what the customer was shown, which is the
 * thing being counted.
 */
async function topItems(input: {
  readonly from: Date;
  readonly to: Date;
}): Promise<readonly RankedItem[]> {
  const lines = await prisma.orderItem.groupBy({
    by: ["nameSnapshot"],
    where: {
      order: {
        status: "DELIVERED",
        placedAt: { gte: input.from, lt: input.to },
      },
    },
    _sum: { quantity: true, lineTotalKobo: true },
  });

  return lines
    .map((line) => ({
      name: line.nameSnapshot,
      quantity: line._sum.quantity ?? 0,
      revenueKobo: line._sum.lineTotalKobo ?? 0n,
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 15);
}

/** The default window for the screen: the last thirty Lagos days, ending today. */
export function defaultAnalyticsWindow(now: Date = new Date()): { from: Date; to: Date } {
  // `to` is the start of tomorrow, not of today, so today's trade is included.
  // A dashboard that hides the current day is a dashboard that looks broken
  // every morning until the first order of the day lands.
  return { from: lagosDayStartDaysAgo(29, now), to: lagosDayStartDaysAgo(-1, now) };
}
