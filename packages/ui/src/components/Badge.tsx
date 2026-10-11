import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * Badge and status pill.
 *
 * A pill carries a `tone`, never a colour. The mapping from an order state to a
 * tone lives once in the application, so the same state cannot be amber on the
 * dashboard and grey in the list. UX_SPEC section 2: a rider and an admin read
 * the same word in the same colour.
 */

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export interface BadgeProps {
  readonly tone?: Tone;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return (
    <span className={cn("kf-badge", tone !== "neutral" && `kf-badge--${tone}`, className)}>
      {children}
    </span>
  );
}

export interface StatusPillProps {
  readonly tone?: Tone;
  readonly label: string;
  /**
   * A dot that breathes, for a state that is still moving. It is what makes
   * "out for delivery" distinguishable from "delivered" at a glance, before
   * the label is read.
   */
  readonly live?: boolean;
  readonly className?: string;
}

export function StatusPill({ tone = "neutral", label, live = false, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "kf-badge",
        tone !== "neutral" && `kf-badge--${tone}`,
        live && "kf-badge--pulse",
        className,
      )}
    >
      <span className="kf-badge__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
