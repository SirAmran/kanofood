import { prisma } from "@kanofood/db";

/**
 * The home screen's featured rail. Screen 4.1 in docs/UX_SPEC.md.
 *
 * The rail is merchandising, not ranking. It used to be built only from popular
 * items, which meant a new kitchen could never appear until somebody had already
 * ordered from it. A featured card is an explicit editorial choice an operator
 * makes on `/admin/featured`: a photograph, a line of copy and a link.
 *
 * **The six starting cards live here as a fallback, not as seed rows.** A fresh
 * deployment still opens with a real-looking storefront, and the admin screen
 * offers one button that copies them into the table so they become editable.
 * The alternative, seeding content in `prisma/seed.ts`, would put invented
 * kitchens and prices into a database whose first real customer would see them.
 * These are photographs and category lines, and the operator replaces them.
 *
 * A query failure returns the fallback as well. The home screen is the front
 * door; a missing table during a half-finished deploy should not take it down.
 * The failure is logged once, with the code, so the reason is still findable.
 */

export interface FeaturedCardView {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly imageUrl: string | null;
  readonly thumbUrl: string | null;
  readonly href: string;
  readonly badge: string | null;
}

/** The thumbnail next to a full-size image, if the name follows the convention. */
function thumbFor(imageUrl: string | null): string | null {
  if (!imageUrl || !imageUrl.includes("/images/featured/")) return imageUrl;
  return imageUrl.replace(/\.webp$/, "-thumb.webp");
}

function fallback(
  id: string,
  title: string,
  subtitle: string,
  image: string,
  href: string,
  badge: string | null,
): FeaturedCardView {
  const imageUrl = `/images/featured/${image}.webp`;
  return { id, title, subtitle, imageUrl, thumbUrl: thumbFor(imageUrl), href, badge };
}

/**
 * What a storefront with no featured rows shows. Each line is a category rather
 * than an invented kitchen: the food is real, the photography is licensed, and
 * nothing claims a kitchen sells something it does not.
 */
export const FEATURED_FALLBACK: readonly FeaturedCardView[] = [
  fallback("starter-parfait", "Strawberry Parfait", "Chilled dessert · Drinks", "parfait", "/kitchens", "New"),
  fallback(
    "starter-fried-rice",
    "Chinese Fried Rice",
    "Wok-tossed · Rice",
    "chinese-fried-rice",
    "/kitchens",
    "Trending",
  ),
  fallback(
    "starter-tuwo",
    "Tuwo & Miyan Kuka",
    "Mama Aisha Kitchen · Kano classic",
    "tuwo-miyan-kuka",
    "/kitchens/mama-aisha-kitchen",
    "Local favourite",
  ),
  fallback("starter-suya", "Suya Platter", "Mama Aisha Kitchen · Grill", "suya", "/kitchens/mama-aisha-kitchen", "Hot"),
  fallback(
    "starter-jollof",
    "Jollof & Grilled Chicken",
    "Mama Aisha Kitchen · Rice",
    "jollof-chicken",
    "/kitchens/mama-aisha-kitchen",
    null,
  ),
  fallback("starter-zobo", "Chilled Zobo", "Mama Aisha Kitchen · Drink", "zobo", "/kitchens/mama-aisha-kitchen", "Cold"),
];

/** The rail is a glance. Past six, nobody swipes and the page gets heavy. */
export const FEATURED_LIMIT = 8;

export async function loadFeaturedCards(): Promise<readonly FeaturedCardView[]> {
  try {
    const rows = await prisma.featuredCard.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        subtitle: true,
        imageUrl: true,
        href: true,
        badge: true,
        isActive: true,
      },
    });

    // No rows at all means "this deployment has not chosen", so the starting
    // set applies. Rows that are all switched off mean "the operator hid the
    // rail", and that answer is an empty rail, not the defaults coming back.
    if (rows.length === 0) return FEATURED_FALLBACK;

    return rows
      .filter((row) => row.isActive)
      .slice(0, FEATURED_LIMIT)
      .map((row) => ({
        id: row.id,
        title: row.title,
        subtitle: row.subtitle,
        imageUrl: row.imageUrl,
        thumbUrl: row.imageUrl,
        href: row.href,
        badge: row.badge,
      }));
  } catch (error) {
    console.error("[featured] could not read featured cards, using the starting set", error);
    return FEATURED_FALLBACK;
  }
}

/** Used by the admin screen to offer the starting set without duplicating it. */
export function featuredFallbackRows() {
  return FEATURED_FALLBACK.map((card, index) => ({
    title: card.title,
    subtitle: card.subtitle,
    imageUrl: card.imageUrl,
    href: card.href,
    badge: card.badge,
    sortOrder: index,
    isActive: true,
  }));
}
