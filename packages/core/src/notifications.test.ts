import { test } from "node:test";
import assert from "node:assert/strict";

import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_RECIPIENTS,
  notificationChannels,
  notificationCopy,
  notificationRecipients,
  notificationRoutes,
  notifies,
} from "./notifications.ts";
import { ORDER_STATUSES } from "./order-status.ts";

import type { OrderNotificationContext } from "./notifications.ts";

const CONTEXT: OrderNotificationContext = {
  orderNumber: "KF-2401",
  kitchenName: "Mama Aisha Kitchen",
  totalKobo: 550000n,
  areaName: "Sabon Gari",
};

/**
 * Every status with at least one route, written out rather than derived, so a
 * status that quietly loses its notification fails here instead of going silent
 * in production.
 */
const ROUTED_STATUSES = [
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "RIDER_ASSIGNED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CUSTOMER_CANCELLED",
  "KITCHEN_REJECTED",
  "ADMIN_CANCELLED",
  "DELIVERY_FAILED",
];

test("the catalogue names exactly nine routed statuses and four silent ones", () => {
  const routed = ORDER_STATUSES.filter(
    (status) => notificationRecipients(status).length > 0,
  );
  assert.deepEqual([...routed], ROUTED_STATUSES);

  const silent = ORDER_STATUSES.filter((status) => !routed.includes(status));
  assert.deepEqual([...silent], [
    "KITCHEN_ACCEPTED",
    "PREPARING",
    "READY_FOR_PICKUP",
    "PICKED_UP",
  ]);
});

test("no status tells the same party twice", () => {
  for (const status of ORDER_STATUSES) {
    const recipients = notificationRecipients(status);
    assert.equal(
      new Set(recipients).size,
      recipients.length,
      `${status} names a recipient more than once`,
    );
  }
});

test("every route uses channels that exist, and every pair has words", () => {
  for (const status of ORDER_STATUSES) {
    for (const { recipient, channels } of notificationRoutes(status)) {
      assert.ok(NOTIFICATION_RECIPIENTS.includes(recipient));
      assert.ok(channels.length > 0, `${status} -> ${recipient} has no channel`);
      for (const channel of channels) {
        assert.ok(
          NOTIFICATION_CHANNELS.includes(channel),
          `${status} -> ${recipient} uses unknown channel ${channel}`,
        );
      }

      const copy = notificationCopy(status, recipient, CONTEXT);
      assert.ok(copy.title.trim().length > 0, `${status} -> ${recipient} has a blank title`);
      assert.ok(copy.body.trim().length > 0, `${status} -> ${recipient} has a blank body`);
      // A push title is cut off on a locked phone, so it has to stay short.
      assert.ok(
        copy.title.length <= 60,
        `${status} -> ${recipient} title is ${copy.title.length} characters`,
      );
    }
  }
});

test("a customer is never mailed, on any status", () => {
  // Yoyo's correction, 2026-10-25: mail was never for customers. They are in the
  // browser or the app, so in-app and push carry everything they get. Email is
  // the audit channel for the people who step away from a screen.
  for (const status of ORDER_STATUSES) {
    assert.equal(
      notificationChannels(status, "customer").includes("email"),
      false,
      `${status} tries to email a customer`,
    );
  }
});

test("the admin is told about a new order on all three channels", () => {
  // ARCHITECTURE section 8: "Admin is notified immediately on every new order."
  // Section 9 makes the confirmation call the launch procedure, so it is mail as
  // well as a push.
  assert.deepEqual([...notificationChannels("PENDING_CONFIRMATION", "admin")], [
    "in_app",
    "push",
    "email",
  ]);

  const copy = notificationCopy("PENDING_CONFIRMATION", "admin", CONTEXT);
  assert.equal(copy.title, "New order KF-2401");
  assert.match(copy.body, /Mama Aisha Kitchen/);
  assert.match(copy.body, /₦5,500\.00/);
  assert.match(copy.body, /confirm/i);
});

test("the kitchen is told when the order reaches it, and not before", () => {
  // Section 4's flow: "order arrives (notified)". That is CONFIRMED; at
  // PENDING_CONFIRMATION the platform is still calling the customer and the
  // kitchen has not been asked for anything.
  assert.equal(notifies("PENDING_CONFIRMATION", "kitchen"), false);
  assert.deepEqual([...notificationChannels("CONFIRMED", "kitchen")], [
    "in_app",
    "push",
    "email",
  ]);
  assert.match(notificationCopy("CONFIRMED", "kitchen", CONTEXT).title, /KF-2401/);
});

test("the customer's first notification is the confirmation, not the placement", () => {
  const first = ORDER_STATUSES.find((status) => notifies(status, "customer"));
  assert.equal(first, "CONFIRMED");
});

test("a party is never told about their own action", () => {
  assert.equal(notifies("KITCHEN_REJECTED", "kitchen"), false);
  assert.equal(notifies("CUSTOMER_CANCELLED", "customer"), false);
  assert.equal(notifies("ADMIN_CANCELLED", "admin"), false);
  assert.equal(notifies("DELIVERED", "rider"), false);
});

test("a silent pair has no channels and no words", () => {
  assert.deepEqual([...notificationChannels("PREPARING", "customer")], []);
  assert.throws(
    () => notificationCopy("PREPARING", "customer", CONTEXT),
    /No notification is sent to customer when an order is PREPARING/,
  );
});

test("a stated reason reaches the people who act on it", () => {
  const rejected = notificationCopy("KITCHEN_REJECTED", "admin", {
    ...CONTEXT,
    reasonLabel: "An item sold out",
  });
  assert.match(rejected.body, /An item sold out/);

  // A missing reason must not leave a trailing colon or the word "null".
  const bare = notificationCopy("DELIVERY_FAILED", "admin", CONTEXT);
  assert.equal(bare.body, "The rider could not complete it.");
  assert.doesNotMatch(bare.body, /null|undefined/);
});

test("the rider's assignment names the area when it is known", () => {
  const withArea = notificationCopy("RIDER_ASSIGNED", "rider", CONTEXT);
  assert.match(withArea.body, /Mama Aisha Kitchen/);
  assert.match(withArea.body, /Sabon Gari/);

  const withoutArea = notificationCopy("RIDER_ASSIGNED", "rider", {
    ...CONTEXT,
    areaName: null,
  });
  assert.equal(withoutArea.body, "Collect from Mama Aisha Kitchen.");
});
