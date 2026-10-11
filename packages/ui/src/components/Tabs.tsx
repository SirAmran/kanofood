import { Fragment } from "react";
import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * Tabs.
 *
 * Rendered as links rather than as client state, so a tab is a URL. That means
 * the back button works, a filtered view can be linked to a colleague, and the
 * whole thing survives a refresh without JavaScript having to restore where you
 * were. Nothing here needs a client boundary.
 */

export interface TabItem {
  readonly href: string;
  readonly label: string;
  /** A count shown beside the label, for a strip that filters by state. */
  readonly count?: number;
}

export interface TabsProps {
  readonly items: readonly TabItem[];
  /** The href currently open. Matched exactly, so pass the real pathname. */
  readonly activeHref: string;
  /** Renders an `<a>`; pass the router's `Link` so navigation stays client-side. */
  readonly renderLink?: (href: string, className: string, children: ReactNode) => ReactNode;
  /** Announced to a screen reader, because it names what the strip switches. */
  readonly label?: string;
  readonly className?: string;
}

export function Tabs({ items, activeHref, renderLink, label = "Views", className }: TabsProps) {
  return (
    <nav className={cn("kf-tabs", className)} aria-label={label}>
      {items.map((item) => {
        const children = (
          <>
            {item.label}
            {item.count === undefined ? null : (
              <span className="kf-muted" style={{ marginLeft: "0.4em" }}>
                {item.count}
              </span>
            )}
          </>
        );

        const active = item.href === activeHref;

        if (renderLink) {
          return <Fragment key={item.href}>{renderLink(item.href, "kf-tab", children)}</Fragment>;
        }

        return (
          <a key={item.href} href={item.href} className="kf-tab" aria-current={active ? "page" : undefined}>
            {children}
          </a>
        );
      })}
    </nav>
  );
}
