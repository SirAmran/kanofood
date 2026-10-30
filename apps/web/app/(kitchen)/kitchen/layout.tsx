import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Kitchen route group. Sign in, dashboard, the order queue, menu management and
 * basic sales. Screens 5.1 to 5.8 in docs/UX_SPEC.md.
 *
 * Designed for desktop first, fully usable on a phone. Tables become stacked
 * cards on mobile.
 *
 * Authorisation for this group is server side and fails closed. A missing or
 * unparseable role is a denial. See docs/ARCHITECTURE.md section 7.
 */

/**
 * The Kitchen install manifest, not the storefront's.
 *
 * This is the whole reason the manifests are route handlers: an installed
 * `/kitchen` should open on `/kitchen`, carry the Kitchen icon and appear in a
 * launcher as "KFDs Kitchen", while the customer app installs from `/`. The
 * metadata resolver takes the nearest segment's value, so this one wins on every
 * route inside the group. See `lib/manifests.ts`.
 */
export const metadata: Metadata = {
  manifest: "/kitchen/manifest.webmanifest",
};

export default function KitchenLayout({ children }: { children: ReactNode }) {
  return <div data-role="kitchen">{children}</div>;
}
