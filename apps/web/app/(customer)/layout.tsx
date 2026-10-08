import type { ReactNode } from "react";

/**
 * Customer route group. Owns the public site: home, search, kitchen and menu
 * browsing, cart, checkout, order confirmation and tracking.
 *
 * Mobile layout is the product here. Tablet and desktop centre the content at a
 * readable width rather than stretching the phone layout. See docs/UX_SPEC.md
 * section 3.
 *
 * The always-visible delivery location bar belongs in this layout.
 */
export default function CustomerLayout({ children }: { children: ReactNode }) {
  return <div data-role="customer">{children}</div>;
}
