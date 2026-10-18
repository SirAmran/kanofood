import Link from "next/link";

import type { SavedLocation } from "@/lib/public/location-shared";

/**
 * The delivery bar, on every storefront page.
 *
 * It used to expand into a form in place. Now it links to screen 4.8, because the
 * one thing the inline panel could not do was collect the address text a rider
 * needs, and moving to a whole screen is the smaller change for a job that now
 * has five fields and an area check.
 */
export function LocationBar({ location }: { readonly location: SavedLocation | null }) {
  return (
    <Link href="/location" className="sf-location__button" aria-label="Change delivery location">
      <span className="sf-location__pin" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      </span>
      <span className="sf-location__text">
        <span className="sf-location__label">Deliver to</span>
        <span className="sf-location__value">{location ? location.label : "Set your location"}</span>
      </span>
      <span className="sf-location__change">{location ? "Change" : "Set"}</span>
    </Link>
  );
}
