import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * Pagination.
 *
 * Links, not buttons, so paging is a URL and the back button undoes it. The
 * admin lists are read-heavy and get left open; a page that only exists in
 * component state cannot be refreshed, bookmarked or shared.
 *
 * The range text says which rows are on screen, because "page 3 of 12" does not
 * tell an operator whether the order they are hunting for is in front of them.
 */

export interface PaginationProps {
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
  readonly pageSize: number;
  /** Builds the href for a page number, so the current filters survive paging. */
  readonly hrefFor: (page: number) => string;
  /** Renders an `<a>`; pass the router's `Link` to keep navigation client-side. */
  readonly renderLink?: (href: string, className: string, children: ReactNode) => ReactNode;
  readonly className?: string;
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  hrefFor,
  renderLink,
  className,
}: PaginationProps) {
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const atStart = page <= 1;
  const atEnd = page >= pageCount;

  const link = (href: string, children: ReactNode, disabled: boolean) => {
    if (disabled) {
      return (
        <span className="kf-btn kf-btn--ghost kf-btn--sm" aria-disabled="true">
          {children}
        </span>
      );
    }
    const classes = cn("kf-btn", "kf-btn--ghost", "kf-btn--sm");
    if (renderLink) return <>{renderLink(href, classes, children)}</>;
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  };

  return (
    <nav className={cn("kf-pagination", className)} aria-label="Pagination">
      <span>
        <span className="kf-numeric">
          {first}-{last}
        </span>{" "}
        of <span className="kf-numeric">{total}</span>
      </span>
      <span className="kf-cluster">
        {link(hrefFor(page - 1), "Previous", atStart)}
        <span className="kf-numeric">
          Page {page} of {pageCount}
        </span>
        {link(hrefFor(page + 1), "Next", atEnd)}
      </span>
    </nav>
  );
}
