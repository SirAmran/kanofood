import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

import { cn } from "../cn";

/**
 * Table.
 *
 * Admin is desktop first and a table becomes stacked cards on a phone, which is
 * UX_SPEC section 3. The stacking is driven by `label` on each cell: on a narrow
 * screen the header row is hidden and each cell prints its own label, so a
 * column heading is never lost with the row it belonged to.
 */

export function TableWrap({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <div className={cn("kf-table-wrap", className)}>{children}</div>;
}

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** Collapses to stacked cards below 640px. Off for a two-column layout table. */
  readonly stacked?: boolean;
}

export function Table({ stacked = true, className, ...rest }: TableProps) {
  return <table {...rest} className={cn("kf-table", stacked && "kf-table--stacked", className)} />;
}

export interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Right-aligns a money or count column so the digits line up. */
  readonly numeric?: boolean;
}

export function Th({ numeric = false, className, ...rest }: ThProps) {
  return <th {...rest} className={cn(numeric && "kf-table__numeric", className)} scope="col" />;
}

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  readonly numeric?: boolean;
  readonly muted?: boolean;
  /** Printed as the cell's label when the table stacks on a phone. */
  readonly label?: string;
}

export function Td({ numeric = false, muted = false, label, className, ...rest }: TdProps) {
  return (
    <td
      {...rest}
      data-label={label}
      className={cn(numeric && "kf-table__numeric", muted && "kf-table__muted", className)}
    />
  );
}
