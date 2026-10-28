import Link from "next/link";
import type { ReactNode } from "react";

import { brandName, brandTagline, shortBrandName } from "@/lib/brand";
import { readSavedLocation } from "@/lib/public/location";

import { CartLink } from "./_components/cart-link";
import { CartProvider } from "./_components/cart-provider";
import { BottomNav } from "./_components/bottom-nav";
import { LocationBar } from "./_components/location-bar";
import "./storefront.css";

/**
 * Customer route group. Owns the public site: home, search, kitchen and menu
 * browsing, cart, checkout, order confirmation and tracking.
 *
 * Mobile layout is the product here. Tablet and desktop centre the content at a
 * readable width rather than stretching the phone layout. See docs/UX_SPEC.md
 * section 3.
 *
 * The location bar is read on the server so the first paint can carry real
 * delivery fees. The cart is browser-only, so its provider sits here and every
 * screen reads it from context.
 *
 * The header carries the short name and the footer the full one, on purpose:
 * KanoFoods is the business, KFDs is what should become the shorthand people
 * say. Both come from `lib/brand.ts` so a deployment that renames itself does
 * not need a code change.
 */

export default async function CustomerLayout({ children }: { readonly children: ReactNode }) {
  const location = await readSavedLocation();

  return (
    <div data-role="customer" className="sf-shell">
      <CartProvider>
        <header className="sf-header">
          <div className="sf-header__inner">
            <Link href="/" className="sf-brand">
              {shortBrandName()}
            </Link>
            <div className="sf-header__actions">
              <Link href="/search" className="sf-icon-button" aria-label="Search kitchens or dishes">
                <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </Link>
              <CartLink />
            </div>
          </div>
          <div className="sf-header__location">
            <LocationBar location={location} />
          </div>
        </header>

        <main className="sf-main">{children}</main>

        <footer className="sf-footer">
          <span>
            {brandName()} · {brandTagline()}
          </span>
          <Link href="/help" className="sf-footer__link">
            Help and contact
          </Link>
        </footer>

        <BottomNav />
      </CartProvider>
    </div>
  );
}
