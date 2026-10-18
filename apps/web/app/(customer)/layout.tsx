import Link from "next/link";
import type { ReactNode } from "react";

import { readSavedLocation } from "@/lib/public/location";

import { CartLink } from "./_components/cart-link";
import { CartProvider } from "./_components/cart-provider";
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
 */

function brandName(): string {
  const configured = process.env.BRAND_NAME?.trim();
  return configured ? configured : "KanoFood";
}

export default async function CustomerLayout({ children }: { readonly children: ReactNode }) {
  const location = await readSavedLocation();
  const brand = brandName();

  return (
    <div data-role="customer" className="sf-shell">
      <CartProvider>
        <header className="sf-header">
          <div className="sf-header__inner">
            <Link href="/" className="sf-brand">
              {brand}
            </Link>
            <CartLink />
          </div>
          <div className="sf-header__location">
            <LocationBar initial={location} />
          </div>
        </header>

        <main className="sf-main">{children}</main>

        <footer className="sf-footer">
          {brand} · Food delivery in Kano Metropolitan.
        </footer>
      </CartProvider>
    </div>
  );
}
