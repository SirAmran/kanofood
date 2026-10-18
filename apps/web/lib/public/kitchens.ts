import {
  type Kobo,
  LOST_STATUSES,
  haversineKm,
  resolveDeliveryFee,
  resolveZone,
} from "@kanofood/core";
import { prisma } from "@kanofood/db";

import { loadActiveZones } from "../zones";

/**
 * Browsing. Screens 4.1 to 4.6 in docs/UX_SPEC.md.
 *
 * This is the first thing a customer touches, so it is public and it is
 * read-only. Nothing here writes a row, which means the whole browse surface can
 * be exercised by anyone, as often as they like, without leaving a trace: no
 * view counters, no search logs, no "recently viewed". A storefront that records
 * every anonymous visit is a privacy decision nobody asked for, and the data it
 * would collect is not needed to sell food.
 *
 * **The delivery fee is priced per kitchen, from the customer's point.** A fee
 * band is measured against the distance from the kitchen that cooks the food, so
 * the same customer sitting in the same place sees a different fee on two
 * kitchens down different streets. That is the whole reason section 5 stores fee
 * bands rather than one number, and it is why every browse response takes an
 * optional point: with one, cards carry a real fee, and without one they carry
 * `null` and the screen shows the zone's base fee or nothing at all.
 *
 * Every kitchen in one response is priced against the *same* resolved zone,
 * because the zone comes from where the customer is, not from where the kitchen
 * is. One `resolveZone` for the list, then one distance and one band lookup per
 * kitchen, all in memory. A version that resolved the zone per kitchen would
 * repeat the same point-in-polygon test N times for an identical answer.
 */

/** How far a browse row can be from the customer before it stops being nearby. */
const NEARBY_RADIUS_KM = 12;

const DEFAULT_LIMIT = 40;

export interface BrowsePoint {
  readonly lat: number;
  readonly lng: number;
}

export type BrowseSort = "recommended" | "distance" | "fee" | "prep" | "name";

/** A kitchen as a card. Every browse screen renders this and nothing more. */
export interface KitchenCard {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly coverUrl: string | null;
  readonly logoUrl: string | null;
  /** The market reads location by landmark, so that is preferred over a street. */
  readonly area: string | null;
  readonly prepTimeMinutes: number | null;
  readonly isOpen: boolean;
  /** Section names, for the chips on a card. Capped at three. */
  readonly categories: readonly string[];
  readonly menuItemCount: number;
  /**
   * `null` in three honest cases: no point was sent, the kitchen has no
   * coordinates, or the point is outside every active zone. A screen must show
   * "fee at checkout" rather than a zero, because zero is a real price.
   */
  readonly deliveryFeeKobo: Kobo | null;
  readonly distanceKm: number | null;
}

export interface BrowseResult {
  /** False when the customer's point is outside every active zone. */
  readonly deliverable: boolean;
  readonly zone: { readonly slug: string; readonly name: string } | null;
  readonly kitchens: readonly KitchenCard[];
}

export interface BrowseFilters {
  readonly search?: string;
  readonly category?: string;
  readonly openNow?: boolean;
  readonly sort?: BrowseSort;
  readonly point?: BrowsePoint | null;
  readonly limit?: number;
}

/** Two decimal places: the precision a fee band is stored at. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The zone the customer is standing in, with its bands, and a point for every
 * kitchen. Returned together because pricing a list needs both and loading them
 * separately would be two round trips to answer one question.
 */
async function loadPricing(point: BrowsePoint | null) {
  const zones = await loadActiveZones({ withFeeBands: point !== null });
  return point ? (resolveZone(zones, point) ?? null) : null;
}

/**
 * A kitchen that cannot be priced.
 *
 * A base fee is the right answer for a kitchen with no coordinates only when
 * there is a point to serve: `resolveDeliveryFee` falls back to the zone's base
 * fee when there is no distance to measure against, and that fallback is
 * documented in core. With no point at all there is no zone and therefore no fee
 * and no distance, which is what `null` says.
 */
function priceFor(
  zone: ReturnType<typeof resolveZone> | null,
  kitchen: { lat: number | null; lng: number | null },
  point: BrowsePoint | null,
): { feeKobo: Kobo | null; distanceKm: number | null } {
  if (!zone || !point) return { feeKobo: null, distanceKm: null };

  if (kitchen.lat === null || kitchen.lng === null) {
    return { feeKobo: resolveDeliveryFee(zone, 0).feeKobo, distanceKm: null };
  }

  const distanceKm = haversineKm({ lat: kitchen.lat, lng: kitchen.lng }, point);

  return {
    feeKobo: resolveDeliveryFee(zone, distanceKm).feeKobo,
    distanceKm: round2(distanceKm),
  };
}

/** Nulls last, so an unmeasurable row never leads a list sorted by a measure. */
function compareNullable<T>(
  a: T | null,
  b: T | null,
  compare: (x: T, y: T) => number,
  direction: 1 | -1,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction * compare(a, b);
}

function sortCards(cards: KitchenCard[], sort: BrowseSort): KitchenCard[] {
  const byName = (a: KitchenCard, b: KitchenCard) => a.name.localeCompare(b.name);

  switch (sort) {
    case "distance":
      return cards.sort(
        (a, b) =>
          compareNullable(a.distanceKm, b.distanceKm, (x, y) => x - y, 1) || byName(a, b),
      );
    case "fee":
      return cards.sort(
        (a, b) =>
          compareNullable(
            a.deliveryFeeKobo,
            b.deliveryFeeKobo,
            (x, y) => (x < y ? -1 : x > y ? 1 : 0),
            1,
          ) || byName(a, b),
      );
    case "prep":
      return cards.sort(
        (a, b) =>
          compareNullable(a.prepTimeMinutes, b.prepTimeMinutes, (x, y) => x - y, 1) ||
          byName(a, b),
      );
    case "name":
      return cards.sort(byName);
    default:
      /**
       * Recommended, which is what a storefront shows when the customer has not
       * chosen a sort. Open first, because a closed kitchen cannot sell anything
       * and belongs below one that can even when it is closer. Then cheapest
       * delivery, then name, so two kitchens with identical fees do not swap
       * places between requests.
       */
      return cards.sort(
        (a, b) =>
          Number(b.isOpen) - Number(a.isOpen) ||
          compareNullable(
            a.deliveryFeeKobo,
            b.deliveryFeeKobo,
            (x, y) => (x < y ? -1 : x > y ? 1 : 0),
            1,
          ) ||
          byName(a, b),
      );
  }
}

/**
 * A card's category chips.
 *
 * Three, because a card is a glance and not a menu. The order is the kitchen's
 * own, so the section they put first is the one a customer sees first.
 */
const CARD_CATEGORY_LIMIT = 3;

const KITCHEN_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  coverUrl: true,
  logoUrl: true,
  addressText: true,
  landmark: true,
  lat: true,
  lng: true,
  prepTimeMinutes: true,
  isOpen: true,
  categories: {
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    // The id as well as the name: a card shows the name, and the detail screen
    // groups items by category, which it can only do by id. One select serves
    // both rather than two that differ by one field and drift.
    select: { id: true, name: true },
  },
  _count: { select: { menuItems: { where: { isAvailable: true } } } },
} as const;

type KitchenRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  coverUrl: string | null;
  logoUrl: string | null;
  addressText: string | null;
  landmark: string | null;
  lat: number | null;
  lng: number | null;
  prepTimeMinutes: number | null;
  isOpen: boolean;
  categories: { id: string; name: string }[];
  _count: { menuItems: number };
};

function toCard(
  row: KitchenRow,
  zone: ReturnType<typeof resolveZone> | null,
  point: BrowsePoint | null,
): KitchenCard {
  const { feeKobo, distanceKm } = priceFor(zone, row, point);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    coverUrl: row.coverUrl,
    logoUrl: row.logoUrl,
    // A landmark is how a customer places a kitchen. Falling back to the street
    // is for the kitchens that have not been given one yet.
    area: row.landmark?.trim() || row.addressText?.trim() || null,
    prepTimeMinutes: row.prepTimeMinutes,
    isOpen: row.isOpen,
    categories: row.categories.slice(0, CARD_CATEGORY_LIMIT).map((category) => category.name),
    menuItemCount: row._count.menuItems,
    deliveryFeeKobo: feeKobo,
    distanceKm,
  };
}

/**
 * Browse, search and filter.
 *
 * A kitchen is listed only when it is active. It is listed whether or not it is
 * open, because a closed kitchen is useful to see: it tells a customer to come
 * back, and hiding it makes the platform look empty. `openNow` filters it out
 * for a customer who is ordering right now.
 */
export async function listPublicKitchens(filters: BrowseFilters): Promise<BrowseResult> {
  const point = filters.point ?? null;
  const search = filters.search?.trim() ?? "";
  const category = filters.category?.trim() ?? "";
  const limit = filters.limit && filters.limit > 0 ? filters.limit : DEFAULT_LIMIT;

  const zone = await loadPricing(point);

  const rows = (await prisma.kitchen.findMany({
    where: {
      isActive: true,
      ...(filters.openNow ? { isOpen: true } : {}),
      ...(category
        ? { categories: { some: { name: category, isActive: true } } }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: KITCHEN_SELECT,
    /**
     * A ceiling, and a deliberate one.
     *
     * Two of the five sorts are on numbers the database does not hold, because
     * both are computed here: distance needs the customer's point and the fee
     * needs the band that point falls in. So the sort happens in memory and this
     * bounds how much memory it can take.
     *
     * **The cost, stated plainly:** past this many active kitchens, a
     * distance-sorted list can miss the nearest one, because the nearest one was
     * never fetched. Kano Metropolitan at launch is nowhere near it. The fix
     * when it matters is to widen the fetch for the two computed sorts, or to
     * store a kitchen's zone on its row and filter in SQL before sorting. It is
     * written down here rather than left for whoever notices a missing kitchen.
     */
    take: 200,
    orderBy: { name: "asc" },
  })) as KitchenRow[];

  const cards = rows.map((row) => toCard(row, zone, point));

  /**
   * "Sitting in the same place" means being inside the zone, and the zone is
   * what decides whether delivery is possible at all: `quoteDelivery` refuses a
   * point in no zone rather than inventing a price. A browse list says the same
   * thing, once, for the whole response, rather than repeating `null` fees down
   * a column and leaving the screen to guess why.
   */
  const deliverable = point === null ? true : zone !== null;

  return {
    deliverable,
    zone: zone ? { slug: zone.slug, name: zone.name } : null,
    kitchens: sortCards(cards, filters.sort ?? "recommended").slice(0, limit),
  };
}

// ---------------------------------------------------------------------------
// Search across kitchens and dishes
// ---------------------------------------------------------------------------

/** One dish in a search result, with the kitchen that sells it. */
export interface DishResult {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly priceKobo: Kobo;
  readonly isAvailable: boolean;
  readonly imageUrl: string | null;
  readonly kitchenName: string;
  readonly kitchenSlug: string;
}

export interface SearchResult {
  readonly kitchens: readonly KitchenCard[];
  readonly dishes: readonly DishResult[];
}

/** Room for a broad word like "rice" without turning the page into a list. */
const SEARCH_DISH_LIMIT = 30;

/**
 * Screen 4.2: one query, two groups of answers.
 *
 * A customer looking for "jollof" may mean a dish or a kitchen, and guessing
 * which one wastes a tap either way, so both are returned and the screen labels
 * them. Dishes come from active kitchens only, because a dish on a kitchen that
 * cannot be ordered from is a dead end; an unavailable dish is still returned
 * and marked, for the same reason the menu shows it disabled.
 */
export async function searchPublic(query: string, point: BrowsePoint | null): Promise<SearchResult> {
  const q = query.trim();
  if (q === "") return { kitchens: [], dishes: [] };

  const zone = await loadPricing(point);
  const contains = { contains: q, mode: "insensitive" as const };

  const [kitchenRows, dishRows] = await Promise.all([
    prisma.kitchen.findMany({
      where: {
        isActive: true,
        OR: [{ name: contains }, { description: contains }],
      },
      select: KITCHEN_SELECT,
      take: 200,
      orderBy: { name: "asc" },
    }),
    prisma.menuItem.findMany({
      where: {
        OR: [{ name: contains }, { description: contains }],
        kitchen: { isActive: true },
      },
      select: {
        id: true,
        name: true,
        description: true,
        priceKobo: true,
        isAvailable: true,
        imageUrl: true,
        kitchen: { select: { name: true, slug: true } },
      },
      take: SEARCH_DISH_LIMIT,
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    kitchens: sortCards((kitchenRows as KitchenRow[]).map((row) => toCard(row, zone, point)), "recommended"),
    dishes: dishRows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      priceKobo: row.priceKobo,
      isAvailable: row.isAvailable,
      imageUrl: row.imageUrl,
      kitchenName: row.kitchen.name,
      kitchenSlug: row.kitchen.slug,
    })),
  };
}

// ---------------------------------------------------------------------------
// A single kitchen, with its menu
// ---------------------------------------------------------------------------

export interface MenuItemView {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly priceKobo: Kobo;
  readonly imageUrl: string | null;
  readonly isAvailable: boolean;
}

export interface MenuSectionView {
  readonly id: string;
  readonly name: string;
  readonly items: readonly MenuItemView[];
}

export interface KitchenDetailView {
  readonly kitchen: KitchenCard & {
    readonly addressText: string | null;
    readonly landmark: string | null;
    /** The kitchen's own line, so a customer can call about a late order. */
    readonly phone: string | null;
  };
  readonly menu: readonly MenuSectionView[];
}

/**
 * One kitchen and its whole menu, in two queries.
 *
 * The menu arrives whole rather than as a second request, because screen 4.5
 * needs every section to render tabs whose labels carry item counts, and screen
 * 4.4 needs the same rows as a preview. Splitting it would make the detail page
 * wait for two round trips to draw one page.
 *
 * An item that is unavailable is *included*, marked, and it is the reason
 * `isAvailable` is on the wire at all: UX_SPEC 4.5 wants it disabled with a
 * reason rather than absent, and a customer who cannot find last week's dish
 * assumes the kitchen dropped it.
 */
export async function getPublicKitchen(
  slug: string,
  point: BrowsePoint | null,
): Promise<KitchenDetailView | null> {
  const zone = await loadPricing(point);

  const row = (await prisma.kitchen.findFirst({
    where: { slug, isActive: true },
    select: {
      ...KITCHEN_SELECT,
      phone: true,
      menuItems: {
        // Every item, available or not. See the note on this function: an
        // unavailable dish is shown and disabled, never hidden.
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          priceKobo: true,
          imageUrl: true,
          isAvailable: true,
          categoryId: true,
        },
      },
    },
  })) as (KitchenRow & {
    phone: string | null;
    menuItems: {
      id: string;
      name: string;
      description: string | null;
      priceKobo: bigint;
      imageUrl: string | null;
      isAvailable: boolean;
      categoryId: string;
    }[];
  }) | null;

  if (!row) return null;

  const byCategory = new Map<string, MenuItemView[]>();
  for (const item of row.menuItems) {
    const list = byCategory.get(item.categoryId) ?? [];
    list.push({
      id: item.id,
      name: item.name,
      description: item.description,
      priceKobo: item.priceKobo,
      imageUrl: item.imageUrl,
      isAvailable: item.isAvailable,
    });
    byCategory.set(item.categoryId, list);
  }

  /**
   * A section with nothing in it is dropped. It is nearly always a section an
   * operator created and has not filled in yet, and an empty tab on a storefront
   * reads as a broken page. The database keeps the row; the customer does not
   * see it.
   */
  const menu: MenuSectionView[] = [];
  for (const category of row.categories) {
    const items = byCategory.get(category.id) ?? [];
    if (items.length > 0) {
      menu.push({ id: category.id, name: category.name, items });
    }
  }

  return {
    kitchen: {
      ...toCard(row, zone, point),
      addressText: row.addressText,
      landmark: row.landmark,
      phone: row.phone,
    },
    menu,
  };
}

// ---------------------------------------------------------------------------
// The home screen's rails
// ---------------------------------------------------------------------------

export interface CategoryChip {
  readonly name: string;
  readonly kitchenCount: number;
}

export interface PopularItem {
  readonly id: string;
  readonly name: string;
  readonly priceKobo: Kobo;
  readonly imageUrl: string | null;
  readonly kitchenName: string;
  readonly kitchenSlug: string;
  readonly orderedCount: number;
}

export interface HomeView {
  readonly deliverable: boolean;
  readonly zone: { readonly slug: string; readonly name: string } | null;
  readonly categories: readonly CategoryChip[];
  readonly kitchens: readonly KitchenCard[];
  readonly popular: readonly PopularItem[];
}

const HOME_KITCHEN_LIMIT = 6;
const HOME_POPULAR_LIMIT = 8;

/**
 * The category chips across every open kitchen.
 *
 * Derived from the menus rather than from a table of approved categories,
 * because there is no such table and there should not be one: a kitchen in Kano
 * sells what it sells, and an admin approving the word "Danwake" before a
 * kitchen may use it is a bottleneck with no benefit. Grouped case-insensitively
 * so "Grills" and "grills" are one chip, and reported with the spelling that
 * comes first alphabetically, which is stable without being arbitrary.
 */
export async function listCategoryChips(limit = 12): Promise<readonly CategoryChip[]> {
  const rows = await prisma.menuCategory.findMany({
    where: { isActive: true, kitchen: { isActive: true, isOpen: true } },
    select: { name: true, kitchenId: true },
  });

  const byName = new Map<string, { label: string; kitchens: Set<string> }>();
  for (const row of rows) {
    const key = row.name.trim().toLowerCase();
    if (key === "") continue;

    const entry = byName.get(key) ?? { label: row.name.trim(), kitchens: new Set<string>() };
    if (row.name.trim() < entry.label) entry.label = row.name.trim();
    entry.kitchens.add(row.kitchenId);
    byName.set(key, entry);
  }

  return [...byName.values()]
    .map((entry) => ({ name: entry.label, kitchenCount: entry.kitchens.size }))
    .sort((a, b) => b.kitchenCount - a.kitchenCount || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * What people actually order.
 *
 * Counted from `OrderItem`, which is the only honest source: a "popular" rail
 * that ranks by what an admin pinned is an advertisement, and a customer can
 * tell. Cancelled and failed orders are excluded, because a dish nobody received
 * was not popular.
 *
 * At launch this returns nothing and the rail disappears. That is correct and
 * temporary: the alternative is seeded fake popularity on a storefront whose
 * first real customers would see it, and a rail that lies on day one is worse
 * than a rail that is absent on day one.
 */
export async function listPopularItems(
  point: BrowsePoint | null,
  limit = HOME_POPULAR_LIMIT,
): Promise<readonly PopularItem[]> {
  const ranked = await prisma.orderItem.groupBy({
    by: ["menuItemId"],
    /**
     * `LOST_STATUSES` rather than a written-out list. It is the same four
     * dead ends the admin's sales figures exclude, and a second copy of them
     * here would be a second chance for the two to disagree.
     *
     * A null `menuItemId` is an item deleted after it was ordered. Its snapshot
     * survives on the order, as designed, but it cannot be browsed back to.
     */
    where: {
      menuItemId: { not: null },
      order: { status: { notIn: [...LOST_STATUSES] } },
    },
    _count: { menuItemId: true },
    orderBy: { _count: { menuItemId: "desc" } },
    take: limit,
  });

  const rankedIds = ranked
    .map((row) => row.menuItemId)
    .filter((id): id is string => id !== null);

  if (rankedIds.length === 0) return [];

  /**
   * The ranking query cannot join, so the rows are fetched after it. `isActive`
   * and availability are re-checked here rather than trusted from the ranking: a
   * dish that sold well last month and is off the menu today must not appear on
   * the home screen, and the counter has no opinion about that.
   */
  const items = await prisma.menuItem.findMany({
    where: {
      id: { in: rankedIds },
      isAvailable: true,
      kitchen: { isActive: true },
    },
    select: {
      id: true,
      name: true,
      priceKobo: true,
      imageUrl: true,
      kitchen: {
        select: {
          name: true,
          slug: true,
          lat: true,
          lng: true,
          isOpen: true,
        },
      },
    },
  });

  const counts = new Map(
    ranked
      .filter((row) => row.menuItemId !== null)
      .map((row) => [row.menuItemId as string, row._count.menuItemId]),
  );
  const zone = await loadPricing(point);

  /**
   * A dish is offered only from a kitchen that can actually reach the customer.
   * With a point, that means a kitchen inside the same zone; with no point,
   * every active kitchen, since nothing has been ruled out yet. Without this the
   * rail would recommend a dish the customer cannot order, which is the fastest
   * way to teach someone the site is broken.
   */
  const reachable = (kitchen: { lat: number | null; lng: number | null; isOpen: boolean }) => {
    if (!point) return true;
    if (!zone) return false;
    if (kitchen.lat === null || kitchen.lng === null) return true;
    return (
      haversineKm({ lat: kitchen.lat, lng: kitchen.lng }, point) <= NEARBY_RADIUS_KM
    );
  };

  return items
    .filter((item) => item.kitchen.isOpen && reachable(item.kitchen))
    .map((item) => ({
      id: item.id,
      name: item.name,
      priceKobo: item.priceKobo,
      imageUrl: item.imageUrl,
      kitchenName: item.kitchen.name,
      kitchenSlug: item.kitchen.slug,
      orderedCount: counts.get(item.id) ?? 0,
    }))
    .sort((a, b) => b.orderedCount - a.orderedCount || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * Everything screen 4.1 draws, in one request.
 *
 * Composed here rather than left to the client, because "nearby" and "popular"
 * are decisions and not queries: a home screen that made three calls would let
 * the rails disagree with each other about which zone the customer is in.
 */
export async function getPublicHome(point: BrowsePoint | null): Promise<HomeView> {
  const [browse, categories, popular] = await Promise.all([
    listPublicKitchens({ point, sort: "distance", limit: HOME_KITCHEN_LIMIT }),
    listCategoryChips(),
    listPopularItems(point),
  ]);

  return {
    deliverable: browse.deliverable,
    zone: browse.zone,
    categories,
    kitchens: browse.kitchens,
    popular,
  };
}
