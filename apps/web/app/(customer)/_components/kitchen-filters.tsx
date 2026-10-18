"use client";

import { useRouter, useSearchParams } from "next/navigation";

import type { CategoryChip } from "@/lib/public/kitchens";

/**
 * Browse filters. Screen 4.3.
 *
 * Every change is a URL change, so a filtered list is a link a customer can
 * share, refresh or go back to. Nothing is kept in component state; the server
 * reads the query and prices the list.
 */
export function KitchenFilters({
  categories,
  category,
  openNow,
  sort,
}: {
  readonly categories: readonly CategoryChip[];
  readonly category: string | null;
  readonly openNow: boolean;
  readonly sort: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.replace(query ? `/kitchens?${query}` : "/kitchens", { scroll: false });
  }

  return (
    <div className="sf-filters">
      <div className="sf-chips" role="list" aria-label="Filter by category">
        <button
          type="button"
          role="listitem"
          className="sf-chip"
          aria-pressed={category === null}
          onClick={() => update({ category: null })}
        >
          All
        </button>
        {categories.map((chip) => (
          <button
            key={chip.name}
            type="button"
            role="listitem"
            className="sf-chip"
            aria-pressed={category === chip.name}
            onClick={() => update({ category: chip.name })}
          >
            {chip.name}
          </button>
        ))}
      </div>

      <div className="sf-filter-row">
        <button
          type="button"
          className="sf-chip"
          aria-pressed={openNow}
          onClick={() => update({ open: openNow ? null : "1" })}
        >
          Open now
        </button>

        <label className="sf-tile__meta" style={{ marginLeft: "auto" }}>
          Sort{" "}
          <select
            className="kf-select"
            value={sort}
            onChange={(event) => update({ sort: event.target.value })}
            aria-label="Sort kitchens"
          >
            <option value="recommended">Recommended</option>
            <option value="distance">Nearest</option>
            <option value="fee">Lowest delivery fee</option>
            <option value="prep">Quickest</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
    </div>
  );
}
