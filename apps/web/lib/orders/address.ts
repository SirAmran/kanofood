/**
 * The one reader of an order's frozen address snapshot, for copy and reports.
 *
 * `orders.address_snapshot` is written at placement and never rewritten: section
 * 5's rule is that editing a saved address must not move an order already placed.
 * Two features read it for a human readable place name, the notification copy and
 * the sheet row, and they must not disagree about what is in it, so the parse
 * lives here rather than twice.
 *
 * The snapshot is `Json`, so what comes back is `unknown`. This reads the one
 * field it needs and tolerates everything else, including a snapshot written by
 * an older shape.
 */
export function addressText(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const value = (snapshot as { addressText?: unknown }).addressText;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
