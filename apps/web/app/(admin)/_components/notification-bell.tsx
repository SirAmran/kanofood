"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Alert, Badge, Button, EmptyState, Modal } from "@kanofood/ui";

/**
 * The bell in the top bar, and the panel it opens.
 *
 * It lives here rather than beside one shell because both shells use it and the
 * component knows nothing about either role: the only thing it is told is where
 * an order detail lives, which is the one address that differs between admin and
 * kitchen. Same arrangement as `SessionKeepAlive` and `SignOutButton`.
 *
 * **Polling, not a socket.** The dispatcher writes a row and forgets it, so
 * there is nothing on the server to push with. A page that is open polls once a
 * minute and on becoming visible again; a page that is closed is exactly what
 * push is for, and that is a later slice. The poll is deliberately cheap: one
 * query, the person's own rows, twenty of them.
 *
 * **Opening is not reading; closing is.** A panel that clears on open makes the
 * "New" marks vanish before they are read, which is the one thing a notification
 * list has to get right. So the badge clears when the panel is closed, and it
 * clears only the rows that were actually on screen: a message that arrives
 * while the panel is open and is never scrolled to is not marked read by
 * somebody who did not see it.
 *
 * **Nothing here can break the screen.** A failed poll leaves the last known
 * badge in place and says so inside the panel. The bell is a convenience on top
 * of a platform that does not depend on it, so it must never be the reason a
 * dashboard is unusable.
 */

interface InboxItem {
  readonly id: string;
  readonly orderId: string;
  readonly orderStatus: string;
  readonly statusLabel: string;
  readonly title: string;
  readonly body: string;
  readonly readAt: string | null;
  readonly createdAt: string;
}

interface InboxResponse {
  readonly ok: boolean;
  readonly data?: { readonly unread: number; readonly items: readonly InboxItem[] };
}

/** One minute: fast enough to feel live, slow enough to be free. */
const POLL_MS = 60_000;

/** The panel shows this many. The badge is the whole inbox. */
const PAGE = 20;

/**
 * A time a person can read at a glance.
 *
 * Recent messages read as elapsed time and older ones as a date, because "3 min
 * ago" is what somebody wants from a notification and "17 Oct, 14:02" is what
 * they want a day later. Rendered only in the browser: the list starts empty, so
 * the server never renders a clock that the client would disagree with.
 */
function when(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${String(minutes)} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${String(hours)} h ago`;

  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
}

export function NotificationBell({ orderHrefBase }: { readonly orderHrefBase: string }) {
  const [items, setItems] = useState<readonly InboxItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/notifications?limit=${String(PAGE)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as InboxResponse;

      if (!response.ok || !payload.ok || !payload.data) {
        setFailed(true);
        return;
      }

      setItems(payload.data.items);
      setUnread(payload.data.unread);
      setFailed(false);
    } catch {
      // Offline, or the server is restarting. The badge keeps its last value and
      // the next poll tries again.
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") void load();
    }

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  async function markRead(ids?: readonly string[]) {
    try {
      await fetch("/api/v1/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ids === undefined ? {} : { ids }),
      });
      await load();
    } catch {
      // The rows stay unread and the badge stays up. A failed write is visible
      // by its own absence, which is the right way round for a read receipt.
    }
  }

  /** Close the panel, and clear the marks on exactly the rows it was showing. */
  function close() {
    setOpen(false);

    const seen = items.filter((item) => item.readAt === null).map((item) => item.id);
    if (seen.length > 0) void markRead(seen);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setOpen(true);
          void load();
        }}
        aria-haspopup="dialog"
      >
        Notifications
        {unread > 0 ? <Badge tone="danger">{unread > 99 ? "99+" : unread}</Badge> : null}
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Notifications"
        actions={
          items.length > 0 ? (
            <Button
              size="sm"
              onClick={() => {
                setOpen(false);
                void markRead();
              }}
            >
              Mark all read
            </Button>
          ) : undefined
        }
      >
        {failed ? <Alert tone="danger">Could not reach the server.</Alert> : null}

        {items.length === 0 ? (
          <EmptyState title="Nothing yet">
            Orders that need you will appear here. The bell checks once a minute.
          </EmptyState>
        ) : (
          <ul className="kf-list">
            {items.map((item) => (
              <li key={item.id} className="kf-list__row">
                <div className="kf-list__body">
                  <div className="kf-list__title">
                    <Link
                      href={`${orderHrefBase}/${item.orderId}`}
                      className="kf-link"
                      onClick={close}
                    >
                      {item.title}
                    </Link>
                  </div>
                  <div>{item.body}</div>
                  <div className="kf-list__meta">
                    <span>{item.statusLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>{when(item.createdAt)}</span>
                  </div>
                </div>

                {item.readAt === null ? (
                  <span className="kf-list__trailing">
                    <Badge tone="accent">New</Badge>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
