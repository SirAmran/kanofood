import type { Metadata } from "next";

import { Alert, EmptyState } from "@kanofood/ui";

import { readSavedLocation } from "@/lib/public/location";
import { listCategoryChips, listPublicKitchens, type BrowseSort } from "@/lib/public/kitchens";

import { KitchenFilters } from "../_components/kitchen-filters";
import { KitchenTile } from "../_components/kitchen-tile";

/**
 * Kitchen listing. Screen 4.3.
 *
 * Filters live in the query string so the page is a link and the back button
 * works. The sort is applied after delivery fees are resolved, which is why the
 * service takes the point rather than the route sorting prices it never sees.
 */

export const metadata: Metadata = { title: "Kitchens" };

const SORTS: readonly BrowseSort[] = ["recommended", "distance", "fee", "prep", "name"];

function one(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

export default async function KitchensPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const category = one(params.category);
  const openNow = one(params.open) === "1";
  const requested = one(params.sort);
  const sort: BrowseSort = SORTS.includes(requested as BrowseSort)
    ? (requested as BrowseSort)
    : "recommended";

  const location = await readSavedLocation();
  const point = location ? { lat: location.lat, lng: location.lng } : null;

  const [categories, result] = await Promise.all([
    listCategoryChips(),
    listPublicKitchens({
      category: category ?? undefined,
      openNow,
      sort,
      point,
      limit: 100,
    }),
  ]);

  return (
    <section className="sf-section">
      <div className="sf-hero">
        <h1 className="sf-hero__title">Kitchens</h1>
        <p className="sf-hero__sub">
          {location
            ? `Delivering to ${location.label}.`
            : "Set your location to see fees and distances."}
        </p>
      </div>

      <KitchenFilters categories={categories} category={category} openNow={openNow} sort={sort} />

      {location && !result.deliverable ? (
        <Alert tone="warning" title="Not in a delivery zone yet">
          We do not deliver to {location.label} at the moment.
        </Alert>
      ) : null}

      {result.kitchens.length === 0 ? (
        <EmptyState
          title="No kitchens match"
          action={
            <a href="/kitchens" className="kf-btn kf-btn--secondary kf-btn--sm">
              Clear filters
            </a>
          }
        >
          {openNow
            ? "Nothing is open with these filters right now. Try switching Open now off."
            : "No kitchen matches these filters. Try another category."}
        </EmptyState>
      ) : (
        <div className="sf-results-grid">
          {result.kitchens.map((kitchen) => (
            <KitchenTile key={kitchen.id} kitchen={kitchen} />
          ))}
        </div>
      )}
    </section>
  );
}
