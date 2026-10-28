import type { ReactNode } from "react";

/**
 * A route transition, and nothing else.
 *
 * `template.tsx` is a new instance on every navigation, which is exactly what a
 * one-shot entrance needs: the wrapper enters once, then gets out of the way.
 * The animation is opacity and transform only, on the one decelerating curve,
 * and `prefers-reduced-motion` shortens it to nothing in `storefront.css`.
 *
 * Deliberately a server component. The transition is CSS; shipping a client
 * boundary for it would make the first paint wait for JavaScript to prove that
 * nothing happened.
 */
export default function CustomerTemplate({ children }: { readonly children: ReactNode }) {
  return <div className="sf-enter">{children}</div>;
}
