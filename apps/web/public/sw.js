/*
 * The service worker. Registered by `_components/push-subscribe.tsx`, served
 * from `/sw.js` so its scope is the whole application.
 *
 * Two events matter, and both are required for push to be worth anything:
 *
 *   - `push` is the message arriving. A push that shows nothing is one the
 *     browser will eventually punish the site for, so every push here draws a
 *     notification.
 *   - `notificationclick` is the person acting on it. Without it the
 *     notification opens a fresh copy of the site at the home page and the order
 *     they were told about is nowhere in sight.
 *
 * Plain JavaScript with no build step on purpose: this file is served byte for
 * byte from `public/`, so there is no bundler between the source and the browser
 * to get the scope or the MIME type wrong.
 *
 * **Unproven in a browser.** No browser driver exists on the machine this was
 * written on, so the shape below follows the Push API rather than an observed
 * delivery. It has not been run.
 */

/* eslint-env serviceworker */

/** Where a notification with no URL of its own lands. */
const FALLBACK_URL = "/";

self.addEventListener("install", (event) => {
  // Nothing to precache: this is a live application, and a cached shell would
  // show yesterday's order status. The worker exists for push only.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  // Take over open tabs immediately, so a customer who has the tracking page up
  // when they subscribe is controlled without a reload.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  /**
   * A push with no data is legal and some services send one as a keepalive. The
   * fallback copy is deliberately generic: it says something happened without
   * inventing which order or what happened to it.
   */
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    payload = null;
  }

  const title = text(payload && payload.title, "KanoFood");
  const body = text(payload && payload.body, "There is an update on your order.");
  const url = text(payload && payload.url, FALLBACK_URL);
  const tag = text(payload && payload.tag, undefined);

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      // A tag replaces rather than stacks: two updates on one order leave one
      // notification on the lock screen, not a column of them.
      ...(tag ? { tag } : {}),
      data: {
        url,
        notificationId: text(payload && payload.notificationId, null),
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const target = absolute(data.url);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      // Focus a tab that is already on this page rather than opening a second
      // copy of the same order, which is what a customer tapping twice produces.
      for (const client of windows) {
        if (client.url === target && "focus" in client) return client.focus();
      }

      // Otherwise prefer a tab of this application already open, and navigate it.
      for (const client of windows) {
        if ("navigate" in client && new URL(client.url).origin === self.location.origin) {
          try {
            const navigated = await client.navigate(target);
            if (navigated && "focus" in navigated) return navigated.focus();
          } catch {
            // A tab that refuses to navigate is not a dead end; fall through to
            // opening a new one.
          }
        }
      }

      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    })(),
  );
});

/** A non-empty string from the payload, or the fallback. Never a value from a stranger. */
function text(value, fallback) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

/**
 * A same-origin URL, whatever the payload said.
 *
 * The payload is written by our own server, but the worker still refuses an
 * absolute URL to another site: a notification is a trusted thing to click, and
 * a message that could send it anywhere is one bug away from a phishing link.
 */
function absolute(value) {
  try {
    const url = new URL(value || FALLBACK_URL, self.location.origin);
    return url.origin === self.location.origin ? url.href : new URL(FALLBACK_URL, self.location.origin).href;
  } catch {
    return new URL(FALLBACK_URL, self.location.origin).href;
  }
}
