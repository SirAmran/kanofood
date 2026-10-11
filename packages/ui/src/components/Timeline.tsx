import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * Timeline.
 *
 * The order event log, oldest to newest, newest emphasised. `orders.status` is a
 * cache of what `order_events` already records, and this is the screen where the
 * record itself is read, so the emphasis has to be on the most recent entry
 * rather than on a status badge somewhere else on the page.
 */

export interface TimelineEntry {
  /** Stable key. An event id, not an index, because the list is re-rendered. */
  readonly id: string;
  readonly title: ReactNode;
  readonly time: ReactNode;
  readonly body?: ReactNode;
  readonly current?: boolean;
}

export function Timeline({
  items,
  className,
  label = "History",
}: {
  readonly items: readonly TimelineEntry[];
  readonly className?: string;
  readonly label?: string;
}) {
  if (items.length === 0) return null;

  return (
    <ol className={cn("kf-timeline", className)} aria-label={label}>
      {items.map((item) => (
        <li
          key={item.id}
          className={cn("kf-timeline__item", item.current && "kf-timeline__item--current")}
        >
          <div className="kf-timeline__head">
            <span className="kf-timeline__title">{item.title}</span>
            <time className="kf-timeline__time">{item.time}</time>
          </div>
          {item.body ? <div className="kf-timeline__body">{item.body}</div> : null}
        </li>
      ))}
    </ol>
  );
}
