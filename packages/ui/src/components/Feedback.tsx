import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * Feedback.
 *
 * The five things a screen says when it is not showing data: something
 * happened, there is nothing here, something broke, work is in progress, or
 * work is about to arrive.
 *
 * All five are here rather than in the screens because UX_SPEC section 8
 * requires every list to handle the same four states the same way, and the only
 * way that stays true is if there is one implementation to reuse.
 */

export type AlertTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface AlertProps {
  readonly tone?: AlertTone;
  readonly title?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
}

export function Alert({ tone = "neutral", title, children, className }: AlertProps) {
  return (
    <div
      className={cn("kf-alert", tone !== "neutral" && `kf-alert--${tone}`, className)}
      role={tone === "danger" ? "alert" : "status"}
    >
      {title ? <span className="kf-alert__title">{title}</span> : null}
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  readonly title: string;
  readonly children?: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <div className="kf-state">
      <span className="kf-state__title">{title}</span>
      {children ? <p className="kf-state__body">{children}</p> : null}
      {action}
    </div>
  );
}

/**
 * The failure state. `onRetry` is optional because a read that failed because
 * the person is offline should offer a retry and a write that failed because the
 * server refused it should not.
 */
export function ErrorState({
  title = "That did not load",
  children,
  action,
}: {
  readonly title?: string;
  readonly children?: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <div className="kf-state" role="alert">
      <span className="kf-state__title">{title}</span>
      {children ? <p className="kf-state__body">{children}</p> : null}
      {action}
    </div>
  );
}

export function Spinner({ label }: { readonly label?: string }) {
  return (
    <span className="kf-cluster">
      <span className="kf-spinner" aria-hidden="true" />
      {label ? <span className="kf-muted">{label}</span> : <span className="kf-visually-hidden">Loading</span>}
    </span>
  );
}

export function Skeleton({ className }: { readonly className?: string }) {
  return <span className={cn("kf-skeleton", className)} aria-hidden="true" />;
}

/**
 * A block of skeleton lines. The widths are uneven because a paragraph of equal
 * bars reads as a loading graphic rather than as text about to appear.
 */
export function SkeletonText({ lines = 3, className }: { readonly lines?: number; readonly className?: string }) {
  const widths = ["100%", "92%", "78%", "96%", "84%", "70%"];
  return (
    <span className={cn("kf-stack", "kf-stack--tight", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className="kf-skeleton kf-skeleton--text"
          style={{ display: "block", width: widths[index % widths.length] }}
        />
      ))}
    </span>
  );
}

/** The skeleton for a table, so a loading list keeps the height it will have. */
export function SkeletonRows({ rows = 5, columns = 4 }: { readonly rows?: number; readonly columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} aria-hidden="true">
          {Array.from({ length: columns }, (_, column) => (
            <td key={column}>
              <span className="kf-skeleton kf-skeleton--text" style={{ display: "block" }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
