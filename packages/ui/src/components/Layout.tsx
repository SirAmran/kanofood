import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * Layout.
 *
 * The handful of arrangements every screen needs. Deliberately few: anything
 * more specific belongs on the screen itself, and a design system that grows a
 * layout primitive per page has stopped being a system.
 *
 * These are server-safe and render plain elements, so a page can compose them
 * without pulling a client boundary in behind it.
 */

export function Stack({
  tight = false,
  className,
  children,
}: {
  readonly tight?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return <div className={cn("kf-stack", tight && "kf-stack--tight", className)}>{children}</div>;
}

/** A row that wraps. For a line of buttons, pills or small facts. */
export function Cluster({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  return <div className={cn("kf-cluster", className)}>{children}</div>;
}

/** A row that pushes its last child to the far edge. */
export function Spread({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  return <div className={cn("kf-spread", className)}>{children}</div>;
}

export function Grid({
  wide = false,
  className,
  children,
}: {
  readonly wide?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return <div className={cn("kf-grid", wide && "kf-grid--wide", className)}>{children}</div>;
}

/** A list beside a detail pane, collapsing to one column below 1024px. */
export function Split({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  return <div className={cn("kf-split", className)}>{children}</div>;
}

export function PageHeader({
  title,
  sub,
  action,
  className,
}: {
  readonly title: ReactNode;
  readonly sub?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <header className={cn("kf-page-header", className)}>
      <div>
        <h1 className="kf-page-header__title">{title}</h1>
        {sub ? <p className="kf-page-header__sub">{sub}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function SectionHeader({
  title,
  action,
  className,
}: {
  readonly title: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("kf-section-header", className)}>
      <h2 className="kf-section-header__title">{title}</h2>
      {action}
    </div>
  );
}

/**
 * The action a screen exists for, kept within thumb reach on a phone. `spread`
 * puts a summary on the left and the buttons on the right, which is what a
 * total-plus-pay bar needs.
 */
export function StickyBar({
  spread = false,
  className,
  children,
}: {
  readonly spread?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={cn("kf-sticky-bar", spread && "kf-sticky-bar--spread", className)}>{children}</div>
  );
}

export interface DescriptionItem {
  readonly term: string;
  readonly value: ReactNode;
}

/**
 * Label and value pairs. A `<dl>` rather than a table, because these are not
 * tabular data and a screen reader should read them as pairs.
 */
export function DescriptionList({
  items,
  className,
}: {
  readonly items: readonly DescriptionItem[];
  readonly className?: string;
}) {
  return (
    <dl className={cn("kf-dl", className)}>
      {items.map((item) => (
        <div key={item.term} style={{ display: "contents" }}>
          <dt>{item.term}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Text for a screen reader that would be noise on screen. */
export function VisuallyHidden({ children }: { readonly children: ReactNode }) {
  return <span className="kf-visually-hidden">{children}</span>;
}
