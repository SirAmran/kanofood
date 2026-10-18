import Link from "next/link";

import { formatNaira } from "@kanofood/core";
import { Alert, EmptyState, Media, SectionHeader } from "@kanofood/ui";

import { readSavedLocation } from "@/lib/public/location";
import { getPublicHome } from "@/lib/public/kitchens";

import { KitchenTile } from "./_components/kitchen-tile";

/**
 * Customer home. Screen 4.1 in docs/UX_SPEC.md: delivery location bar, search,
 * category chips, nearby kitchens, popular items.
 *
 * The location bar itself belongs to the layout. This screen only reacts to
 * whether a point is known, because every fee and distance on it depends on
 * that. Nothing here is cached: the point is a cookie and the menu moves.
 */
export default async function CustomerHomePage() {
  const location = await readSavedLocation();
  const point = location ? { lat: location.lat, lng: location.lng } : null;
  const home = await getPublicHome(point);

  return (
    <>
      <section className="sf-hero">
        <h1 className="sf-hero__title">What are you eating today?</h1>
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
        Search kitchens or dishes
      </Link>

      {home.categories.length > 0 ? (
        <div className="sf-chips" role="list" aria-label="Categories">
          {home.categories.map((category) => (
            <Link
              key={category.name}
              role="listitem"
              href={`/kitchens?category=${encodeURIComponent(category.name)}`}
              className="sf-chip"
            >
              {category.name}
            </Link>
          ))}
        </div>
      ) : null}

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
          <div className="sf-rail">
            {home.kitchens.map((kitchen) => (
              <KitchenTile key={kitchen.id} kitchen={kitchen} />
            ))}
          </div>
        )}
      </section>

      {home.popular.length > 0 ? (
        <section className="sf-section">
          <SectionHeader title="Popular in Kano" />
          <div className="sf-popular">
            {home.popular.map((item) => (
              <Link
                key={item.id}
                href={`/kitchens/${item.kitchenSlug}/menu/${item.id}`}
                className="sf-popular-item"
              >
                <Media src={item.imageUrl} alt="" shape="thumb" fallback={null} />
                <span className="sf-popular-item__body">
                  <span className="sf-popular-item__name">{item.name}</span>
                  <span className="sf-popular-item__meta">
                    {item.kitchenName} · ordered {item.orderedCount} times
                  </span>
                </span>
                <span className="sf-popular-item__price">{formatNaira(item.priceKobo)}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
