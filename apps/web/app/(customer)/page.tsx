import Link from "next/link";

import { formatNaira } from "@kanofood/core";
import { Alert, EmptyState, Media, SectionHeader } from "@kanofood/ui";

import { readSavedLocation } from "@/lib/public/location";
import { loadFeaturedCards } from "@/lib/public/featured";
import { getPublicHome } from "@/lib/public/kitchens";

import { FeaturedRail } from "./_components/featured-rail";
import { KitchenTile } from "./_components/kitchen-tile";
import { StudentPack } from "./_components/student-pack";

/**
 * Customer home. Screen 4.1 in docs/UX_SPEC.md.
 *
 * The order is the order a person decides in: what looks good, what is near,
 * what is cheap tonight. A featured photograph leads because a storefront is a
 * shop window before it is a search box; the search entry is one line below it,
 * not hidden behind an icon.
 *
 * **Two rails, two different questions.** "Featured" is editorial and is
 * controlled on `/admin/featured`. "Popular" is counted from delivered orders
 * and stays honest by staying empty until somebody has actually ordered. The
 * home screen is not cached: the point is a cookie, the menus move, and a
 * highlight changed on a phone in the office should reach a customer on the next
 * request.
 *
 * The location bar itself belongs to the layout. This screen only reacts to
 * whether a point is known, because every fee and distance on it depends on
 * that.
 */

/**
 * A dish is easier to scan with a shape than with a word at 14px. These are the
 * categories kitchens actually name, with a plate for anything else; the map is
 * cosmetic and never decides whether a chip renders.
 */
const CATEGORY_GLYPH: Readonly<Record<string, string>> = {
  rice: "🍚",
  "rice dishes": "🍚",
  grills: "🍢",
  grill: "🍢",
  suya: "🍢",
  soups: "🍲",
  soup: "🍲",
  swallows: "🥣",
  drinks: "🥤",
  drink: "🥤",
  desserts: "🍮",
  dessert: "🍮",
  breakfast: "🍳",
  pastries: "🥐",
  chicken: "🍗",
  fish: "🐟",
  "fast food": "🍔",
  shawarma: "🌯",
  snacks: "🍟",
  salads: "🥗",
};

function glyphFor(name: string): string {
  return CATEGORY_GLYPH[name.trim().toLowerCase()] ?? "🍽️";
}

export default async function CustomerHomePage() {
  const location = await readSavedLocation();
  const point = location ? { lat: location.lat, lng: location.lng } : null;
  const [home, featured] = await Promise.all([getPublicHome(point), loadFeaturedCards()]);

  return (
    <>
      <section className="sf-hero">
        <span className="sf-eyebrow">
          <span className="sf-live-dot" aria-hidden="true" />
          {location ? "Delivering to you" : "Kano Metropolitan"} · Open now
        </span>
        <h1 className="sf-hero__title">
          What are you <span className="sf-hero__accent">eating</span> today?
        </h1>
        <p className="sf-hero__sub">
          {location
            ? `Delivering to ${location.label}${home.zone ? ` · ${home.zone.name}` : ""}.`
            : "Set your location to see how close each kitchen is and what delivery costs."}
        </p>
      </section>

      {location && !home.deliverable ? (
        <Alert tone="warning" title="Not in a delivery zone yet">
          We do not deliver to {location.label} at the moment. You can still browse the kitchens.
        </Alert>
      ) : null}

      <Link href="/search" className="sf-search-entry">
        <span className="sf-search-entry__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <span className="sf-search-entry__label">Search kitchens or dishes</span>
        <span className="sf-search-entry__hint" aria-hidden="true">
          Try “jollof”
        </span>
      </Link>

      {featured.length > 0 ? (
        <section className="sf-section sf-section--featured">
          <SectionHeader
            title="Featured today"
            action={
              <Link href="/kitchens" className="kf-link">
                See all
              </Link>
            }
          />
          <FeaturedRail cards={featured} />
        </section>
      ) : null}

      {home.categories.length > 0 ? (
        <section className="sf-section sf-section--chips">
          <SectionHeader title="What are you craving?" />
          <div className="sf-chips" role="list" aria-label="Categories">
            {home.categories.map((category) => (
              <Link
                key={category.name}
                role="listitem"
                href={`/kitchens?category=${encodeURIComponent(category.name)}`}
                className="sf-chip"
              >
                <span className="sf-chip__glyph" aria-hidden="true">
                  {glyphFor(category.name)}
                </span>
                {category.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <StudentPack />

      <section className="sf-section">
        <SectionHeader
          title="Kitchens near you"
          action={
            <Link href="/kitchens" className="kf-link">
              See all
            </Link>
          }
        />
        {home.kitchens.length === 0 ? (
          <EmptyState title="No kitchens yet">
            Nothing is listed for delivery right now. Check back shortly.
          </EmptyState>
        ) : (
          <div className="sf-rail sf-rail--kitchens">
            {home.kitchens.map((kitchen) => (
              <KitchenTile key={kitchen.id} kitchen={kitchen} />
            ))}
          </div>
        )}
      </section>

      {home.popular.length > 0 ? (
        <section className="sf-section">
          <SectionHeader
            title="Popular in Kano"
            action={
              <Link href="/kitchens" className="kf-link">
                Browse
              </Link>
            }
          />
          <div className="sf-rail sf-rail--dishes">
            {home.popular.map((item) => (
              <Link
                key={item.id}
                href={`/kitchens/${item.kitchenSlug}/menu/${item.id}`}
                className="sf-dish-card"
              >
                <Media
                  src={item.imageUrl}
                  alt=""
                  shape="square"
                  fallback={<span className="sf-dish-card__fallback">{item.name.slice(0, 1)}</span>}
                />
                <span className="sf-dish-card__body">
                  <span className="sf-dish-card__name">{item.name}</span>
                  <span className="sf-dish-card__meta">
                    {item.kitchenName} · ordered {item.orderedCount} times
                  </span>
                  <span className="sf-dish-card__price">{formatNaira(item.priceKobo)}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
