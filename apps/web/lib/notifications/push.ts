import { prisma } from "@kanofood/db";
import { WebPushError, sendNotification } from "web-push";

import { pushVapidPrivateKey, pushVapidPublicKey, pushVapidSubject } from "@/lib/env";

import type { NotificationProvider, OutgoingNotification, ProviderResult } from "./providers";

/**
 * Web Push. docs/ARCHITECTURE.md section 8 puts it first among the channels
 * because it is free, and it is the only channel that reaches a customer without
 * asking them for an account: a guest tracking an order gets a buzz when the
 * kitchen accepts it or the rider picks it up, which is most of the reason the
 * tracking page exists.
 *
 * **`web-push` does the protocol work.** Sending a push needs an ES256 assertion
 * identifying this deployment (RFC 8292) and a payload encrypted to the
 * subscription's own key (RFC 8291 on top of RFC 8188). That is a library's job:
 * a hand-written copy would be a hundred lines nobody reads and a bug nobody
 * finds until a device silently stops showing messages.
 *
 * **The subscription is the address.** Section 8: push is looked up by the
 * person, not carried on the message, so `OutgoingNotification.address` is null
 * here by design and this provider owns the lookup.
 *
 * **Built, not proven.** No browser driver exists on the machine this was written
 * on, so nothing below has been exercised against a real push service end to end.
 * What would prove it: subscribe from the tracking page in a browser, move an
 * order in the admin, watch the notification arrive. Until that has happened, a
 * green `sent` row means "the push service accepted it", which is all a `sent`
 * row has ever meant for this channel.
 */

/** A push service that hangs must not hold a dispatch open for the whole cycle. */
const TIMEOUT_MS = 10_000;

/** Four hours. A status update that waited longer than that is no longer news. */
const TTL_SECONDS = 4 * 60 * 60;

const UNCONFIGURED =
  "Web Push is not configured. Set PUSH_VAPID_PUBLIC_KEY and PUSH_VAPID_PRIVATE_KEY to send it.";

/** What the service worker receives. Everything the notification shows comes from here. */
interface PushPayload {
  readonly title: string;
  readonly body: string;
  readonly notificationId: string;
  /** Absent when this provider could not work out where the message belongs. */
  readonly url?: string;
  /** A newer message with the same tag replaces the older one on the lock screen. */
  readonly tag: string;
}

export const pushProvider: NotificationProvider = {
  channel: "push",

  /**
   * Both keys, because one is useless alone: the public key is what the browser
   * subscribes with and the private one is what signs the send. The subject is
   * not required here; it has a documented fallback in `lib/env.ts`, so a
   * deployment that has not chosen a contact address can still push.
   */
  isConfigured: () => pushVapidPublicKey() !== null && pushVapidPrivateKey() !== null,

  unconfiguredReason: () => UNCONFIGURED,

  async send(message: OutgoingNotification): Promise<ProviderResult> {
    const publicKey = pushVapidPublicKey();
    const privateKey = pushVapidPrivateKey();

    /**
     * The dispatcher only calls a configured provider, so reaching here without
     * both keys means the environment changed between the check and the send.
     * Skipped rather than thrown: that is a configuration gap affecting every
     * message on the channel, not one message going wrong.
     */
    if (!publicKey || !privateKey) return { skippedReason: UNCONFIGURED };

    /**
     * Exactly one owner, matching the row and the database's CHECK. Both set is a
     * dispatcher bug and is refused here rather than sent to twice the people.
     */
    const owner = message.userId
      ? message.customerId
        ? null
        : { userId: message.userId }
      : message.customerId
        ? { customerId: message.customerId }
        : null;
    if (!owner) return { skippedReason: "There is nobody to push to." };

    const [subscriptions, notification] = await Promise.all([
      prisma.pushSubscription.findMany({
        where: { ...owner, disabledAt: null },
        select: { endpoint: true, p256dh: true, auth: true },
        // Oldest first, so the reference returned below names the longest-lived
        // device rather than whichever row the planner felt like reading first.
        orderBy: { createdAt: "asc" },
      }),
      /**
       * Where the notification opens. One small read through the row the
       * dispatcher just wrote, so the service worker never has to guess a URL
       * from a title.
       */
      prisma.notification.findUnique({
        where: { id: message.id },
        select: { order: { select: { orderNumber: true } } },
      }),
    ]);

    if (subscriptions.length === 0) {
      /**
       * Not a failure. A person who has not enabled notifications on any device
       * is a normal fact about them, and marking the row `failed` would put a red
       * mark on the admin's view for something nobody did wrong.
       */
      return { skippedReason: "This person has no push subscription registered." };
    }

    const orderNumber = notification?.order.orderNumber ?? null;

    const payload: PushPayload = {
      title: message.title,
      body: message.body,
      notificationId: message.id,
      /**
       * Only a customer has a page this can open. `/orders/:number` is a
       * credential-free address that reads the token from the browser's own
       * storage, so opening it on the device that subscribed is enough.
       *
       * A staff message has no single screen: the same row reads differently in
       * the admin, the kitchen and the rider shells, and the payload does not
       * carry the role. Rather than guess a shell and land somebody on a
       * refusal, the URL is left out and the service worker opens the app itself.
       */
      ...(orderNumber && message.customerId ? { url: `/orders/${orderNumber}` } : {}),
      /** One order's messages replace each other; anything else replaces itself. */
      tag: orderNumber ? `order:${orderNumber}` : message.id,
    };

    const body = JSON.stringify(payload);
    const vapidDetails = { subject: pushVapidSubject(), publicKey, privateKey };

    const results = await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        try {
          await sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            body,
            { vapidDetails, TTL: TTL_SECONDS, timeout: TIMEOUT_MS },
          );
          return subscription.endpoint;
        } catch (error) {
          /**
           * 404 and 410 are the push service saying this endpoint will never
           * accept anything again: the browser was uninstalled, the permission
           * was revoked, or the profile was wiped. The row is deleted rather than
           * retried forever, because every future dispatch would otherwise pay
           * for a request that is guaranteed to fail.
           *
           * Anything else is this attempt's problem and the row is kept: a 429 or
           * a 500 from the push service is a message that might go out next time.
           */
          if (
            error instanceof WebPushError &&
            (error.statusCode === 404 || error.statusCode === 410)
          ) {
            await prisma.pushSubscription.deleteMany({
              where: { endpoint: subscription.endpoint },
            });
            throw new Error(`Endpoint gone (${String(error.statusCode)}), removed.`);
          }
          throw error;
        }
      }),
    );

    const delivered = results
      .filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled")
      .map((result) => result.value);

    if (delivered.length === 0) {
      /**
       * Nobody accepted it, so the message did not go out. Throwing is what makes
       * the dispatcher write `failed` with the reason; returning quietly would
       * record a delivery that never happened.
       */
      const reasons = results
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) =>
          result.reason instanceof Error ? result.reason.message : String(result.reason),
        );

      throw new Error(`No device accepted the push. ${reasons.join(" | ")}`.slice(0, 500));
    }

    /**
     * The host of the endpoint that took it, not the endpoint itself. The
     * reference exists so an operator can tell which push service carried a
     * message; the full capability URL is a credential and does not belong in a
     * column that gets read out during a support call.
     */
    return { providerRef: endpointHost(delivered[0]) };
  },
};

/** `fcm.googleapis.com`, or null when the endpoint is not a URL at all. */
function endpointHost(endpoint: string | undefined): string | null {
  if (!endpoint) return null;
  try {
    return new URL(endpoint).host || null;
  } catch {
    return null;
  }
}
