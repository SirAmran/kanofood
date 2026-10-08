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
export default function KitchenLayout({ children }: { children: ReactNode }) {
  return <div data-role="kitchen">{children}</div>;
}
