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

import { addressText } from "../orders/address";
import { queueOrderSheet } from "../sheets/sync";
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
  /**
   * Where email would send, when there is anywhere for it to go.
   *
   * Resolved here, in the read that already finds the person, rather than inside
   * the email provider: one order move costs one read per person instead of one
   * more per channel, and the provider stays a pure sender.
   *
   * A customer is always `null`. There is no email column on a customer in this
   * schema, and email is internal only (section 8), so a customer is never mailed
   * on any status. Null is the honest value for that, not a gap to be filled.
   */
  readonly address: string | null;
}

type DispatchOrder = {
  readonly id: string;
  readonly orderNumber: string;
  readonly totalKobo: bigint;
  readonly customerId: string;
  readonly kitchenId: string;
  readonly addressSnapshot: unknown;
  readonly kitchen: { readonly name: string };
  readonly delivery: {
    readonly rider: { readonly userId: string; readonly user: { readonly email: string | null } };
  } | null;
};

/**
 * Ask for an order's notifications without waiting for them.
 *
 * Call this at the end of the service that committed the move, never inside the
 * transaction: a notification must not be able to roll back an order, and an
 * order must not wait on a push service.
 *
 * **This is also where the Sheets row is queued**, because both features hang off
 * the same fact: the order moved. The alternative is a second call beside each of
 * the six call sites, which is six more chances to forget one and a sheet that is
 * quietly missing the moves nobody remembered.
 *
 * The `try` around `after` is not defensive noise. `after` only works inside a
 * request, so a script, a seed or a service called directly from a test would
 * throw here and lose the notification entirely. The fallback runs the same
 * work detached, which is the closest thing to the same guarantee outside a
 * request. Neither path ever throws at the caller.
 */
export function queueOrderStatus(orderId: string, status: OrderStatus): void {
  const run = async (): Promise<void> => {
    // All settled, not all: a sheet that is down must not stop the messages, and
    // a provider that throws must not stop the row being written for the sheet.
    const results = await Promise.allSettled([
      dispatchOrderStatus(orderId, status),
      queueOrderSheet(orderId, status),
    ]);

    for (const result of results) {
      if (result.status === "rejected") {
        // The only failures reaching here are the database refusing to store a
        // record of the attempt. Nothing can be written about that, so it is
        // logged rather than swallowed.
        console.error(
          `[notifications] could not record dispatch for order ${orderId} at ${status}`,
          result.reason,
        );
      }
    }
  };

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
      delivery: {
        select: { rider: { select: { userId: true, user: { select: { email: true } } } } },
      },
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
        select: { id: true, email: true },
      });
      for (const admin of admins) {
        targets.push({ recipient, userId: admin.id, customerId: null, address: admin.email });
      }
      continue;
    }

    if (recipient === "kitchen") {
      const staff = await prisma.kitchenStaff.findMany({
        where: { kitchenId: order.kitchenId, user: { isActive: true } },
        select: { userId: true, user: { select: { email: true } } },
      });
      for (const member of staff) {
        targets.push({
          recipient,
          userId: member.userId,
          customerId: null,
          address: member.user.email,
        });
      }
      continue;
    }

    if (recipient === "rider") {
      const rider = order.delivery?.rider;
      if (rider) {
        targets.push({
          recipient,
          userId: rider.userId,
          customerId: null,
          address: rider.user.email,
        });
      }
      continue;
    }

    // The customer route reaches email on no status, so there is nothing to
    // resolve; the address stays null and the dispatcher records a skip if a
    // future edit ever routes email here.
    targets.push({ recipient, userId: null, customerId: order.customerId, address: null });
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

  /**
   * Email with nowhere to go is a skip, not a failure.
   *
   * An admin, staff member or rider can exist with no email on file: a phone
   * number was enough to create the account. Marking that `failed` would put a
   * permanent red mark on the admin's view for an ordinary fact about a person,
   * while the other channels for the same person still worked. The reason is
   * written into the row instead, so the gap is visible without looking broken.
   */
  if (channel === "email" && target.address === null) {
    await markSkipped(id, "No email address is on record for this person.");
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
      address: target.address,
    });

    // The provider said, in words, why it did not send. That is a skip and not a
    // failure: nothing broke, there was simply nowhere for this one to go.
    if (result.skippedReason) {
      await markSkipped(id, result.skippedReason);
      return;
    }

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
