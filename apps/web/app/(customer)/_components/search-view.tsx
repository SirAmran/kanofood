"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatNaira } from "@kanofood/core";
import { EmptyState, Media, Spinner } from "@kanofood/ui";

import type { BrowsePoint, KitchenCard } from "@/lib/public/kitchens";

import { KitchenTile } from "./kitchen-tile";

/**
 * Search. Screen 4.2.
 *
 * The API does the matching; this screen only debounces, cancels stale
 * requests, and remembers recent terms. It calls `/api/v1/public/search`
 * rather than a server action because the storefront is public and the same
 * endpoint is what a native client would use.
 *
 * A request is aborted when the query changes, so a slow answer for "joll" can
 * never arrive after a fast one for "jollof" and replace it.
 */

const RECENT_KEY = "kf_recent_searches_v1";
const RECENT_LIMIT = 6;
const DEBOUNCE_MS = 280;

interface ApiKitchen {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly coverUrl: string | null;
  readonly logoUrl: string | null;
  readonly area: string | null;
  readonly prepTimeMinutes: number | null;
  readonly isOpen: boolean;
  readonly categories: readonly string[];
  readonly menuItemCount: number;
  readonly deliveryFeeKobo: string | null;
  readonly distanceKm: number | null;
}

interface ApiDish {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly priceKobo: string;
  readonly isAvailable: boolean;
  readonly imageUrl: string | null;
  readonly kitchenName: string;
  readonly kitchenSlug: string;
}

interface SearchData {
  readonly kitchens: readonly ApiKitchen[];
  readonly dishes: readonly ApiDish[];
}

function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string").slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

function remember(term: string, current: readonly string[]): string[] {
  const next = [term, ...current.filter((value) => value.toLowerCase() !== term.toLowerCase())].slice(
    0,
    RECENT_LIMIT,
  );
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Remembering is a convenience, not a requirement.
  }
  return next;
}

export function SearchView({ point }: { readonly point: BrowsePoint | null }) {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [data, setData] = useState<SearchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    setRecent(readRecent());
  }, []);

  const trimmed = query.trim();

  useEffect(() => {
    controller.current?.abort();

    if (trimmed === "") {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: trimmed });
        if (point) {
          params.set("lat", String(point.lat));
          params.set("lng", String(point.lng));
        }

        const response = await fetch(`/api/v1/public/search?${params.toString()}`, {
          signal: abort.signal,
        });
        const body: unknown = await response.json();

        if (!response.ok || typeof body !== "object" || body === null) {
          throw new Error("Search failed.");
        }

        const envelope = body as { ok?: boolean; data?: SearchData };
        if (!envelope.ok || !envelope.data) throw new Error("Search failed.");

        setData(envelope.data);
        setLoading(false);
      } catch (cause) {
        if (abort.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Search failed.");
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [trimmed, point]);

  const kitchens = useMemo<KitchenCard[]>(
    () =>
      (data?.kitchens ?? []).map((kitchen) => ({
        ...kitchen,
        deliveryFeeKobo: kitchen.deliveryFeeKobo === null ? null : BigInt(kitchen.deliveryFeeKobo),
      })),
    [data],
  );

  function useTerm(term: string) {
    setQuery(term);
    setRecent(remember(term, recent));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed !== "") setRecent(remember(trimmed, recent));
  }

  const hasResults = kitchens.length > 0 || (data?.dishes.length ?? 0) > 0;

  return (
    <section className="sf-section">
      <div className="sf-hero">
        <h1 className="sf-hero__title">Search</h1>
        <p className="sf-hero__sub">Find a kitchen or a dish by name.</p>
      </div>

      <form role="search" onSubmit={onSubmit}>
        <input
          className="kf-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Jollof, suya, Mama Aisha…"
          aria-label="Search kitchens and dishes"
          autoFocus
          maxLength={80}
          enterKeyHint="search"
        />
      </form>

      {trimmed === "" && recent.length > 0 ? (
        <div className="sf-section">
          <p className="sf-tile__meta">Recent searches</p>
          <div className="sf-chips">
            {recent.map((term) => (
              <button key={term} type="button" className="sf-chip" onClick={() => useTerm(term)}>
                {term}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {trimmed === "" && recent.length === 0 ? (
        <p className="sf-tile__meta">Start typing to see kitchens and dishes.</p>
      ) : null}

      {loading ? (
        <div className="sf-loading">
          <Spinner label="Searching…" />
        </div>
      ) : null}

      {error ? (
        <EmptyState title="That search did not go through">
          {error} Check your connection and try again.
        </EmptyState>
      ) : null}

      {!loading && !error && trimmed !== "" && data !== null && !hasResults ? (
        <EmptyState title="Nothing matched">
          No kitchen or dish here matches “{trimmed}”. Try a shorter word.
        </EmptyState>
      ) : null}

      {kitchens.length > 0 ? (
        <div className="sf-section">
          <p className="sf-tile__meta">Kitchens</p>
          <div className="sf-results-grid">
            {kitchens.map((kitchen) => (
              <KitchenTile key={kitchen.id} kitchen={kitchen} />
            ))}
          </div>
        </div>
      ) : null}

      {data && data.dishes.length > 0 ? (
        <div className="sf-section">
          <p className="sf-tile__meta">Dishes</p>
          <div className="sf-dishes">
            {data.dishes.map((dish) => (
              <Link
                key={dish.id}
                href={`/kitchens/${dish.kitchenSlug}/menu/${dish.id}`}
                className="sf-dish"
                data-unavailable={dish.isAvailable ? "false" : "true"}
              >
                <Media src={dish.imageUrl} alt="" shape="thumb" fallback={null} />
                <span className="sf-dish__body">
                  <span className="sf-dish__name">{dish.name}</span>
                  <span className="sf-dish__meta">
                    {dish.kitchenName}
                    {dish.isAvailable ? "" : " · not available right now"}
                  </span>
                </span>
                <span className="sf-dish__price">{formatNaira(BigInt(dish.priceKobo))}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
