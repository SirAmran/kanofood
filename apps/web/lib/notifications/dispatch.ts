import { after } from "next/server";

import {
  notificationChannels,
  notificationCopy,
  notificationRecipients,
  type NotificationChannel,
  type NotificationRecipient,
  type OrderNotificationContext,
  type OrderStatus,
} from "@kanofood/core";
import { prisma } from "@kanofood/db";

import { providerFor } from "./providers";

/**
 * Turning an order's move into the messages people should get.
 * docs/ARCHITECTURE.md section 8.
 *
 * **Nothing here can delay an order.** Every order write in this application
 * commits first and asks for its notifications second, through `after()`, which
 * runs once the response has been sent. A provider that is down, slow, or not
 * configured costs the order nothing: section 8's rule is that a delivery which
 * succeeds while push is down still succeeds.
 *
 * **Nothing here can be silent.** Each message is a row, written before its
 * provider is touched and updated with what happened. A missing key is `skipped`
 * with the reason, a failed send is `failed` with the error, and both are
 * visible in the admin's view.
 *
 * **Nothing here can be said twice.** Dispatch runs after the response, so a
 * retried request can call it again. The row's `dedupe_key` is unique, which
 * turns the second attempt into a no-op rather than a second push to a kitchen
 * mid-service.
 *
 * Who is told what, and the words, live in `packages/core/src/notifications.ts`
 * keyed by order status. This file only resolves people, writes rows and hands
 * them to providers; if the copy is wrong, the fix is there and not here.
 */

interface Target {
  readonly recipient: NotificationRecipient;
  /** Set for everyone with an account: admin, kitchen staff, rider. */
  readonly userId: string | null;
  /** Set for a guest customer. Never both, which the database also enforces. */
  readonly customerId: string | null;
}

type DispatchOrder = {
  readonly id: string;
  readonly orderNumber: string;
  readonly totalKobo: bigint;
  readonly customerId: string;
  readonly kitchenId: string;
  readonly addressSnapshot: unknown;
  readonly kitchen: { readonly name: string };
  readonly delivery: { readonly rider: { readonly userId: string } } | null;
};

/**
 * Ask for an order's notifications without waiting for them.
 *
 * Call this at the end of the service that committed the move, never inside the
 * transaction: a notification must not be able to roll back an order, and an
 * order must not wait on a push service.
 *
 * The `try` around `after` is not defensive noise. `after` only works inside a
 * request, so a script, a seed or a service called directly from a test would
 * throw here and lose the notification entirely. The fallback runs the same
 * work detached, which is the closest thing to the same guarantee outside a
 * request. Neither path ever throws at the caller.
 */
export function queueOrderStatus(orderId: string, status: OrderStatus): void {
  const run = (): Promise<void> =>
    dispatchOrderStatus(orderId, status).catch((error: unknown) => {
      // The only failure that reaches here is the database refusing to store the
      // record of the attempt. Nothing can be written about that, so it is
      // logged rather than swallowed.
      console.error(
        `[notifications] could not record dispatch for order ${orderId} at ${status}`,
        error,
      );
    });

  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Resolve everyone, write every row, hand each to its provider.
 *
 * Exported for a verification walk to call directly. Application code should use
 * `queueOrderStatus`, or the notifications land in the request's critical path.
 */
export async function dispatchOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<void> {
  const routed = notificationRecipients(status);
  // A silent status is a decision recorded in the catalogue, not a failure.
  if (routed.length === 0) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      totalKobo: true,
      customerId: true,
      kitchenId: true,
      addressSnapshot: true,
      kitchen: { select: { name: true } },
      delivery: { select: { rider: { select: { userId: true } } } },
    },
  });

  // An order that vanished under us has nobody to tell.
  if (!order) return;

  const [reasonLabel, targets] = await Promise.all([
    latestReason(orderId, status),
    resolveTargets(order, routed),
  ]);
  if (targets.length === 0) return;

  const context: OrderNotificationContext = {
    orderNumber: order.orderNumber,
    kitchenName: order.kitchen.name,
    totalKobo: order.totalKobo,
    areaName: addressText(order.addressSnapshot),
    reasonLabel,
  };

  for (const target of targets) {
    const copy = notificationCopy(status, target.recipient, context);
    try {
      await Promise.all(
        notificationChannels(status, target.recipient).map((channel) =>
          deliver({ order, status, target, channel, copy }),
        ),
      );
    } catch (error) {
      // One party's rows failing must not stop the rest of the list. The party
      // that failed is logged; everyone else is still told.
      console.error(
        `[notifications] ${target.recipient} dispatch failed for order ${order.orderNumber} at ${status}`,
        error,
      );
    }
  }
}

/**
 * Who actually receives this status, resolved to rows.
 *
 * The catalogue says `kitchen`, meaning the kitchen as a unit; this is where
 * that becomes one target per active member of staff, which is what makes an
 * unread badge mean anything. A party with nobody to resolve to contributes no
 * targets: an order cancelled before a rider was assigned has no rider to tell,
 * and that is not an error.
 */
async function resolveTargets(
  order: DispatchOrder,
  recipients: readonly NotificationRecipient[],
): Promise<Target[]> {
  const targets: Target[] = [];

  for (const recipient of recipients) {
    if (recipient === "admin") {
      const admins = await prisma.user.findMany({
        where: { role: "admin", isActive: true },
        select: { id: true },
      });
      for (const admin of admins) {
        targets.push({ recipient, userId: admin.id, customerId: null });
      }
      continue;
    }

    if (recipient === "kitchen") {
      const staff = await prisma.kitchenStaff.findMany({
        where: { kitchenId: order.kitchenId, user: { isActive: true } },
        select: { userId: true },
      });
      for (const member of staff) {
        targets.push({ recipient, userId: member.userId, customerId: null });
      }
      continue;
    }

    if (recipient === "rider") {
      const userId = order.delivery?.rider.userId;
      if (userId) targets.push({ recipient, userId, customerId: null });
      continue;
    }

    targets.push({ recipient, userId: null, customerId: order.customerId });
  }

  return targets;
}

/** The reason recorded on the event that made this move, in the words a person reads. */
async function latestReason(orderId: string, status: OrderStatus): Promise<string | null> {
  const event = await prisma.orderEvent.findFirst({
    where: { orderId, toStatus: status },
    orderBy: { createdAt: "desc" },
    select: { reason: true },
  });
  return event?.reason?.trim() || null;
}

/**
 * The delivery area for the copy, read off the order's address snapshot.
 *
 * Parsed here rather than through `readAddressSnapshot` in the rider module,
 * which is the other reader of this shape: that module imports this one, so
 * importing it back would be a cycle. The snapshot is written by `placeOrder`
 * and frozen, so this reads four optional strings and nothing else.
 */
function addressText(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const value = (snapshot as { addressText?: unknown }).addressText;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function deliver(input: {
  order: DispatchOrder;
  status: OrderStatus;
  target: Target;
  channel: NotificationChannel;
  copy: { title: string; body: string };
}): Promise<void> {
  const { order, status, target, channel, copy } = input;

  /**
   * The identity of "this message". Built from the order, the move, the party,
   * the channel and the target, so two dispatches of the same move produce the
   * same key and the unique index answers the second one with a duplicate.
   */
  const dedupeKey = [
    order.id,
    status,
    target.recipient,
    channel,
    target.userId ?? target.customerId,
  ].join(":");

  let id: string;
  try {
    const row = await prisma.notification.create({
      data: {
        orderId: order.id,
        orderStatus: status,
        recipientType: target.recipient,
        userId: target.userId,
        customerId: target.customerId,
        channel,
        title: copy.title,
        body: copy.body,
        dedupeKey,
      },
      select: { id: true },
    });
    id = row.id;
  } catch (error) {
    // Already said on an earlier run of this same move. That is the retry path
    // working, not a failure.
    if (isDuplicate(error)) return;
    throw error;
  }

  const provider = providerFor(channel);
  if (!provider) {
    await markSkipped(id, `No provider is configured for the ${channel} channel yet.`);
    return;
  }
  if (!provider.isConfigured()) {
    await markSkipped(id, provider.unconfiguredReason());
    return;
  }

  try {
    const result = await provider.send({
      id,
      channel,
      title: copy.title,
      body: copy.body,
      userId: target.userId,
      customerId: target.customerId,
    });
    await prisma.notification.updateMany({
      where: { id },
      data: {
        status: "sent",
        sentAt: new Date(),
        providerRef: result.providerRef ?? null,
        error: null,
        attempts: { increment: 1 },
      },
    });
  } catch (error) {
    await prisma.notification.updateMany({
      where: { id },
      data: {
        status: "failed",
        error: describe(error),
        attempts: { increment: 1 },
      },
    });
  }
}

async function markSkipped(id: string, reason: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id },
    data: { status: "skipped", error: reason.slice(0, 500) },
  });
}

function isDuplicate(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/** A provider's failure, as much as fits in a column an operator reads. */
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}
