import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * Money and price rows.
 *
 * The value is already formatted when it arrives. That is deliberate: formatting
 * money is a domain concern that lives in `@kanofood/core` alongside the integer
 * kobo arithmetic, and this package stays free of domain imports so the design
 * system cannot become a place where two roundings quietly disagree.
 *
 * What this component owns is presentation: tabular figures so a column of
 * amounts lines up on the decimal, no wrapping so an amount never breaks across
 * lines, and the danger colour for a negative.
 */

export interface MoneyProps {
  /** A formatted amount, for example from `formatNaira`. */
  readonly value: string;
  readonly negative?: boolean;
  readonly className?: string;
}

export function Money({ value, negative = false, className }: MoneyProps) {
  return (
    <span className={cn("kf-money", negative && "kf-money--negative", className)}>
      {negative ? `-${value}` : value}
    </span>
  );
}

export interface PriceRowProps {
  readonly label: ReactNode;
  /** A formatted amount. */
  readonly value: string;
  /** The one line that matters. Draws the rule above and enlarges the amount. */
  readonly total?: boolean;
  readonly negative?: boolean;
  readonly className?: string;
}

export function PriceRow({ label, value, total = false, negative = false, className }: PriceRowProps) {
  return (
    <div className={cn("kf-price-row", total && "kf-price-row--total", className)}>
      <span className="kf-price-row__label">{label}</span>
      <Money value={value} negative={negative} />
    </div>
  );
}

/** A labelled amount sitting on one line, for a header summary. */
export function MoneySummary({
  label,
  value,
  negative = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly negative?: boolean;
}) {
  return (
    <span className="kf-cluster">
      <span className="kf-muted">{label}</span>
      <Money value={value} negative={negative} />
    </span>
  );
}
