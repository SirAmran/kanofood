import type { ReactNode } from "react";

/**
 * Rider route group. Today's deliveries, delivery detail, cash recording and
 * reporting a failure. Screens 6.1 to 6.5 in docs/UX_SPEC.md.
 *
 * Mobile only by design. Large touch targets, high contrast, readable in
 * daylight. Not designed for desktop, but not broken on it either.
 */
export default function RiderLayout({ children }: { children: ReactNode }) {
  return <div data-role="rider">{children}</div>;
}
