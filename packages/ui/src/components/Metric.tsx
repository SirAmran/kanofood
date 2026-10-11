import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * Metrics.
 *
 * The live counters on the admin dashboard. Two rules from the specification
 * are built in rather than left to the caller:
 *
 * - `stale` dims the whole tile, for UX_SPEC section 8's "every list keeps its
 *   last successful content and marks it stale".
 * - `attention` colours the value, for a count that needs a human.
 *
 * The value is a string rather than a number so a caller can pass a formatted
 * money amount or a duration without this component knowing about either.
 */

export function MetricGrid({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <div className={cn("kf-metrics", className)}>{children}</div>;
}

export interface MetricProps {
  readonly label: string;
  readonly value: string;
  readonly foot?: ReactNode;
  readonly attention?: boolean;
  readonly stale?: boolean;
  readonly className?: string;
}

export function Metric({ label, value, foot, attention = false, stale = false, className }: MetricProps) {
  return (
    <div
      className={cn("kf-metric", attention && "kf-metric--attention", stale && "kf-metric--stale", className)}
    >
      <span className="kf-metric__label">{label}</span>
      <span className="kf-metric__value">{value}</span>
      {foot ? <span className="kf-metric__foot">{foot}</span> : null}
    </div>
  );
}
