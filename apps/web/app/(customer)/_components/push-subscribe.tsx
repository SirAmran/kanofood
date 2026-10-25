"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert, Button } from "@kanofood/ui";

import { readOrderToken } from "./checkout-store";

/**
 * "Tell me when my food moves", on the tracking screen.
 *
 * Push exists for the customer first: a guest has no account, so a notification
 * on the device that placed the order is the only way to reach them without a
 * phone call. Staff push is available through the API and gets no prompt here,
 * because a kitchen screen that asks for permission on every shift is a prompt
 * people learn to click away.
 *
 * Four things have to be true before this does anything, and the component stays
 * silent when any of them is not:
 *
 *   1. the browser has the Push API,
 *   2. the deployment has a VAPID public key (passed down from the server page),
 *   3. this browser holds the order's token, which is what proves to the server
 *      whose subscription this is,
 *   4. we are on a secure origin, which the API enforces itself.
 *
 * **Unproven in a browser.** There is no browser driver on the machine this was
 * written on, so the happy path below follows the Push API rather than an
 * observed subscription. Treat it as built, not verified.
 */

type State = "checking" | "unsupported" | "off" | "subscribed" | "working" | "blocked";

export function PushSubscribe({
  orderNumber,
  vapidPublicKey,
}: {
  readonly orderNumber: string;
  readonly vapidPublicKey: string | null;
}) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);

  /**
   * The token is the credential the subscribe route accepts from a guest, and it
   * is read from this browser's storage rather than sent down from the server,
   * exactly as the tracking screen does. No token, no subscription: the server
   * would have no way to know whose device this is.
   */
  const token = useCallback(() => {
    try {
      return readOrderToken(orderNumber);
    } catch {
      return null;
    }
  }, [orderNumber]);

  /** Record the browser's subscription, so the provider can find it later. */
  const save = useCallback(
    async (subscription: PushSubscription): Promise<void> => {
      const access = token();
      if (!access) throw new Error("This browser no longer has the order's link.");

      const json = subscription.toJSON();
      const endpoint = json.endpoint;
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      // A subscription without both keys cannot be encrypted to, so storing it
      // would be a row that fails on every send.
      if (!endpoint || !p256dh || !auth) throw new Error("The browser did not send a usable subscription.");

      const response = await fetch("/api/v1/notifications/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
        body: JSON.stringify({ endpoint, keys: { p256dh, auth } }),
      });

      if (!response.ok) throw new Error("Notifications could not be switched on right now.");
    },
    [token],
  );

  /** The worker is what shows the notification, so it is registered either way. */
  const registration = useCallback(async (): Promise<ServiceWorkerRegistration> => {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return navigator.serviceWorker.ready;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function check(): Promise<void> {
      // Any of these three missing makes the API unusable, and a button that
      // cannot work is worse than no button.
      if (!vapidPublicKey || !token() || !supported()) {
        if (!cancelled) setState("unsupported");
        return;
      }

      try {
        const worker = await registration();
        const existing = await worker.pushManager.getSubscription();
        if (cancelled) return;

        if (existing) {
          /**
           * Already subscribed on this browser. The row is posted again as a
           * repair: a subscription whose row was deleted, or whose keys rotated,
           * would otherwise be silently dead. The route upserts by endpoint, so
           * this is one write and no duplicate.
           */
          setState("subscribed");
          await save(existing).catch(() => undefined);
          return;
        }

        if (typeof Notification !== "undefined" && Notification.permission === "denied") {
          setState("blocked");
          return;
        }

        setState("off");
      } catch {
        if (!cancelled) setState("unsupported");
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [registration, save, token, vapidPublicKey]);

  async function enable(): Promise<void> {
    setError(null);
    setState("working");

    try {
      // Asked from the click, never on load: a permission prompt with no
      // explanation behind it is how a site gets permanently blocked.
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState("blocked");
        return;
      }
      if (permission !== "granted") {
        setState("off");
        return;
      }

      const worker = await registration();
      const existing = await worker.pushManager.getSubscription();
      const subscription =
        existing ??
        (await worker.pushManager.subscribe({
          // Required by every browser that implements push: a push must always
          // be able to show something, and this is the promise that it will.
          userVisibleOnly: true,
          applicationServerKey: keyBuffer(vapidPublicKey ?? ""),
        }));

      await save(subscription);
      setState("subscribed");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Notifications could not be switched on.",
      );
      setState("off");
    }
  }

  async function disable(): Promise<void> {
    setError(null);
    setState("working");

    try {
      const worker = await registration();
      const existing = await worker.pushManager.getSubscription();

      if (existing) {
        const access = token();
        // The server row goes first: a browser that has unsubscribed cannot be
        // used to prove whose row to delete.
        if (access) {
          await fetch("/api/v1/notifications/subscriptions", {
            method: "DELETE",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
            body: JSON.stringify({ endpoint: existing.endpoint }),
          });
        }
        await existing.unsubscribe();
      }

      setState("off");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Notifications could not be switched off.",
      );
      setState("subscribed");
    }
  }

  if (state === "checking" || state === "unsupported") return null;

  const on = state === "subscribed";

  return (
    <section className="sf-page">
      <div className="sf-form__section">
        <h2 className="sf-form__heading">Order updates</h2>
        <p className="sf-field__hint">
          {on
            ? "This browser will show a notification when your order is accepted, picked up and on its way."
            : "Turn this on and this browser will tell you when your order moves, so you do not have to keep this page open."}
        </p>

        {error ? <Alert tone="warning">{error}</Alert> : null}

        {state === "blocked" ? (
          <p className="sf-field__hint">
            Notifications are blocked for this site. Allow them in your browser settings and reload
            this page.
          </p>
        ) : null}

        <Button
          type="button"
          variant={on ? "secondary" : "primary"}
          block
          loading={state === "working"}
          onClick={() => {
            if (state === "working") return;
            void (on ? disable() : enable());
          }}
        >
          {on ? "Turn off notifications" : "Notify me about this order"}
        </Button>
      </div>
    </section>
  );
}

/** Whether this browser can do any of it. */
function supported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

/**
 * The VAPID public key as bytes.
 *
 * The server stores it base64url, which is what the Push API wants the
 * `applicationServerKey` to decode to: the uncompressed P-256 point. `atob` needs
 * the standard alphabet and the padding back, so both are restored here.
 *
 * An `ArrayBuffer` rather than a view of one: `applicationServerKey` is typed
 * `BufferSource`, and a `Uint8Array` over a `SharedArrayBuffer` is not assignable
 * to it. Owning the buffer removes the question.
 */
function keyBuffer(value: string): ArrayBuffer {
  const padding = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes.buffer;
}
