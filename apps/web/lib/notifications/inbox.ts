import { ORDER_STATUS_LABELS } from "@kanofood/core";
import type { OrderStatus } from "@kanofood/core";
import { prisma } from "@kanofood/db";

/**
 * The in-app inbox: what the bell reads.
 *
 * docs/ARCHITECTURE.md section 8 says every notification is written to
 * `notifications`. The in-app channel is the one where that row *is* the
 * message — there is no provider to hand it to and nothing to send, so the bell
 * reading rows is the whole of the delivery. That is why this file is a read and
 * a mark, and nothing else.
 *
 * **Scoping is the whole security model.** Every query here is narrowed to one
 * `userId`, taken from the signed-in actor and never from the request. A row
 * carries the person it belongs to, so a kitchen member cannot see another
 * kitchen's rows and an admin cannot read a rider's inbox: the filter is the
 * permission, and there is no path that takes a list of ids and returns rows
 * regardless of owner.
 *
 * **The inbox is in-app only.** Email and push rows describe the same events on
 * other channels and are the admin's "what did not go out" view, not a person's
 * messages. Including them would show one event three times to the person it
 * already showed once to.
 */

export interface InboxItem {
  readonly id: string;
  /** The order, so the row can open it. The id, not the number: the number is in the copy. */
  readonly orderId: string;
  readonly orderStatus: OrderStatus;
  /** The status in words, so the list does not have to carry a second lookup. */
  readonly statusLabel: string;
  readonly title: string;
  readonly body: string;
  readonly readAt: string | null;
  readonly createdAt: string;
}

export interface Inbox {
  /** Unread across the whole inbox, not just the page of rows returned. */
  readonly unread: number;
  readonly items: readonly InboxItem[];
}

/** How many the bell shows before it stops. The badge is the total, not this. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

/**
 * This person's messages, newest first, and how many are unread.
 *
 * Both numbers are asked for in one call because the bell needs both to render:
 * a badge without a list shows a number with nothing behind it, and a list
 * without the badge hides the reason anybody opened it.
 */
export async function listInbox(input: {
  readonly userId: string;
  readonly limit?: number;
  readonly unreadOnly?: boolean;
}): Promise<Inbox> {
  const where = {
    userId: input.userId,
    channel: "in_app" as const,
    status: "sent" as const,
    ...(input.unreadOnly ? { readAt: null } : {}),
  };

  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: clampLimit(input.limit),
      select: {
        id: true,
        orderId: true,
        orderStatus: true,
        title: true,
        body: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({
      where: { userId: input.userId, channel: "in_app", status: "sent", readAt: null },
    }),
  ]);

  return {
    unread,
    items: items.map((item) => ({
      id: item.id,
      orderId: item.orderId,
      orderStatus: item.orderStatus as OrderStatus,
      statusLabel: ORDER_STATUS_LABELS[item.orderStatus as OrderStatus],
      title: item.title,
      body: item.body,
      readAt: item.readAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

/**
 * Mark some of this person's messages read, or all of them.
 *
 * `ids` narrows the update and an empty list therefore marks nothing, which is
 * the deliberate reading: a caller that sent a list of nobody's messages has
 * asked to clear nothing, and clearing the lot instead would be a surprise.
 * Omitting `ids` is the "mark all read" the inbox's own button uses.
 *
 * Only unread rows are touched, so the timestamp records when a person first saw
 * a message rather than when they last opened the inbox. A second call is a
 * no-op rather than a rewrite.
 */
export async function markInboxRead(input: {
  readonly userId: string;
  readonly ids?: readonly string[];
}): Promise<{ readonly marked: number }> {
  if (input.ids && input.ids.length === 0) return { marked: 0 };

  const result = await prisma.notification.updateMany({
    where: {
      userId: input.userId,
      channel: "in_app",
      readAt: null,
      ...(input.ids ? { id: { in: [...input.ids] } } : {}),
    },
    data: { readAt: new Date() },
  });

  return { marked: result.count };
}
