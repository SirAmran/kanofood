/**
 * Who is told what, and on which channel. docs/ARCHITECTURE.md section 8.
 *
 * The catalogue here is keyed by the order status an order has just reached, so
 * there is one place that answers "the order moved, does anybody need to know?"
 * A status with no route is a deliberate silence, not an oversight: the record is
 * total, so adding a status without deciding who gets told is a compile error,
 * the same way `ORDER_STATUS_LABELS` makes a status without a word a compile
 * error.
 *
 * Routing is kept beside the copy so the two cannot drift. A route without words
 * is not a route, and the words are short on purpose: a push notification shows
 * a title and one line before it is cut off.
 *
 * **Email is internal only, decided 2026-10-25.** The customer's channels are
 * in-app and push, because a customer is in the browser or the app when an order
 * is live. Email is the audit channel and the fallback for admin, kitchen and
 * rider, where a person may step away from the screen. No customer route in this
 * file carries email, and a test enforces that rather than a comment asking
 * nicely. The customer's future channels are SMS and WhatsApp, which section 8
 * defers on cost.
 */

import type { Kobo } from "./money.ts";
import { formatNaira } from "./money.ts";
import type { OrderStatus } from "./order-status.ts";

/**
 * The five channels section 8 names. Only the first three are implemented in
 * Phase 9; SMS and WhatsApp are present here so a later provider is a new
 * provider behind an existing interface, exactly as section 8 describes, rather
 * than a schema migration.
 *
 * Lowercase to match the value style the schema already uses (`cod`, `transfer`,
 * `owner`), so a row read from the database is the same string this file holds.
 */
export const NOTIFICATION_CHANNELS = [
  "in_app",
  "push",
  "email",
  "sms",
  "whatsapp",
] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * Who a notification is for.
 *
 * Not the `users.role` values in the schema, and deliberately so: `kitchen` means
 * the kitchen as one unit, which resolves to every active member of staff, while
 * `customer` usually resolves to a guest order rather than a `users` row at all.
 * The values match the schema's lowercase style so reading a row is obvious, but
 * nothing should cast one to the other.
 */
export const NOTIFICATION_RECIPIENTS = [
  "admin",
  "kitchen",
  "rider",
  "customer",
] as const;

export type NotificationRecipient = (typeof NOTIFICATION_RECIPIENTS)[number];

/** Everything the copy may read. Passed in, never fetched, so this file stays pure. */
export type OrderNotificationContext = {
  /** The order number as printed everywhere else, e.g. `KF-2401`. */
  orderNumber: string;
  kitchenName: string;
  /** Customer total, in kobo. Never a float; see `money.ts`. */
  totalKobo: Kobo;
  /** Delivery area, when the reader needs to know where it is going. */
  areaName?: string | null;
  /** The stated reason, already turned into words by the caller. */
  reasonLabel?: string | null;
};

export type NotificationCopy = {
  title: string;
  body: string;
};

type Route = {
  readonly recipient: NotificationRecipient;
  readonly channels: readonly NotificationChannel[];
  readonly build: (context: OrderNotificationContext) => NotificationCopy;
};

/**
 * The routing table. A silent status is `[]` and that is a decision recorded
 * here, not a status somebody forgot.
 *
 * The silences and why, so the next session does not "fix" them:
 *
 * - `PREPARING` and `PICKED_UP` tell nobody. The customer's page polls and shows
 *   every step on the timeline; a push per step is noise a customer turns off,
 *   and a customer who turns notifications off cannot be told the rider is
 *   outside.
 * - `READY_FOR_PICKUP` tells nobody. The admin assigned the rider and can see the
 *   queue; the rider is told at `RIDER_ASSIGNED` and again at `OUT_FOR_DELIVERY`,
 *   which are the two moments that matter to them.
 * - A party is never told about their own action: the kitchen is not told it
 *   rejected an order, the customer is not told they cancelled, the admin is not
 *   told they cancelled.
 */
const ROUTES: Readonly<Record<OrderStatus, readonly Route[]>> = {
  PENDING_CONFIRMATION: [
    {
      // section 9: "It lands in PENDING_CONFIRMATION and the admin receives a
      // notification." Email is here because a confirmation call is the launch
      // procedure and it must not sit unseen on a screen nobody is watching.
      recipient: "admin",
      channels: ["in_app", "push", "email"],
      build: ({ orderNumber, kitchenName, totalKobo }) => ({
        title: `New order ${orderNumber}`,
        body: `${kitchenName}, ${formatNaira(totalKobo)}. Call the customer to confirm.`,
      }),
    },
  ],

  CONFIRMED: [
    {
      // section 4: "order arrives (notified)". Confirm is the moment the order
      // reaches the kitchen, which is why this fires here and not at
      // PENDING_CONFIRMATION.
      recipient: "kitchen",
      channels: ["in_app", "push", "email"],
      build: ({ orderNumber, totalKobo }) => ({
        title: `Order ${orderNumber} for you`,
        body: `${formatNaira(totalKobo)} to prepare. Accept or reject it.`,
      }),
    },
    {
      recipient: "customer",
      channels: ["in_app", "push"],
      build: ({ orderNumber, kitchenName }) => ({
        title: "Order confirmed",
        body: `${kitchenName} has your order ${orderNumber}.`,
      }),
    },
  ],

  KITCHEN_ACCEPTED: [],

  PREPARING: [],

  READY_FOR_PICKUP: [],

  RIDER_ASSIGNED: [
    {
      recipient: "rider",
      channels: ["in_app", "push", "email"],
      build: ({ orderNumber, kitchenName, areaName }) => ({
        title: `Delivery ${orderNumber}`,
        body: areaName
          ? `Collect from ${kitchenName}, deliver to ${areaName}.`
          : `Collect from ${kitchenName}.`,
      }),
    },
    {
      recipient: "customer",
      channels: ["in_app", "push"],
      build: ({ orderNumber }) => ({
        title: "Rider assigned",
        body: `Someone is collecting order ${orderNumber}.`,
      }),
    },
  ],

  PICKED_UP: [],

  OUT_FOR_DELIVERY: [
    {
      recipient: "customer",
      channels: ["in_app", "push"],
      build: ({ orderNumber }) => ({
        title: "Out for delivery",
        body: `Order ${orderNumber} is on its way.`,
      }),
    },
  ],

  DELIVERED: [
    {
      recipient: "customer",
      channels: ["in_app", "push"],
      build: ({ orderNumber }) => ({
        title: "Delivered",
        body: `Order ${orderNumber} has arrived. Thank you.`,
      }),
    },
  ],

  CUSTOMER_CANCELLED: [
    {
      recipient: "admin",
      channels: ["in_app", "push"],
      build: ({ orderNumber, kitchenName, reasonLabel }) => ({
        title: `Cancelled ${orderNumber}`,
        body: reasonLabel
          ? `Customer cancelled at ${kitchenName}: ${reasonLabel}.`
          : `Customer cancelled at ${kitchenName}.`,
      }),
    },
    {
      // The food may already be cooking, so the kitchen hears even though the
      // customer told the platform and not the kitchen.
      recipient: "kitchen",
      channels: ["in_app", "email"],
      build: ({ orderNumber, reasonLabel }) => ({
        title: `Order ${orderNumber} cancelled`,
        body: reasonLabel
          ? `The customer cancelled: ${reasonLabel}. Stop preparing it.`
          : "The customer cancelled. Stop preparing it.",
      }),
    },
  ],

  KITCHEN_REJECTED: [
    {
      recipient: "admin",
      channels: ["in_app", "push"],
      build: ({ orderNumber, kitchenName, reasonLabel }) => ({
        title: `Rejected ${orderNumber}`,
        body: reasonLabel
          ? `${kitchenName} turned it down: ${reasonLabel}.`
          : `${kitchenName} turned it down.`,
      }),
    },
    {
      recipient: "customer",
      channels: ["in_app", "push"],
      build: ({ orderNumber, kitchenName }) => ({
        title: "Order not available",
        body: `${kitchenName} could not take order ${orderNumber}.`,
      }),
    },
  ],

  ADMIN_CANCELLED: [
    {
      recipient: "customer",
      channels: ["in_app", "push"],
      build: ({ orderNumber }) => ({
        title: "Order cancelled",
        body: `We had to cancel order ${orderNumber}.`,
      }),
    },
    {
      recipient: "kitchen",
      channels: ["in_app", "email"],
      build: ({ orderNumber, reasonLabel }) => ({
        title: `Order ${orderNumber} cancelled`,
        body: reasonLabel
          ? `Cancelled by the platform: ${reasonLabel}. Stop preparing it.`
          : "Cancelled by the platform. Stop preparing it.",
      }),
    },
    {
      // Only resolves when a rider had actually been assigned; the dispatcher
      // finds nobody to notify otherwise, and that is not an error.
      recipient: "rider",
      channels: ["in_app", "push"],
      build: ({ orderNumber }) => ({
        title: `Delivery ${orderNumber} cancelled`,
        body: "This delivery was cancelled. Do not collect it.",
      }),
    },
  ],

  DELIVERY_FAILED: [
    {
      recipient: "admin",
      channels: ["in_app", "push"],
      build: ({ orderNumber, reasonLabel }) => ({
        title: `Delivery failed ${orderNumber}`,
        body: reasonLabel ? reasonLabel : "The rider could not complete it.",
      }),
    },
    {
      recipient: "customer",
      channels: ["in_app", "push"],
      build: ({ orderNumber }) => ({
        title: "Delivery did not go through",
        body: `We could not complete order ${orderNumber}. An agent will call.`,
      }),
    },
  ],
};

const CHANNEL_SET: ReadonlySet<string> = new Set(NOTIFICATION_CHANNELS);
const RECIPIENT_SET: ReadonlySet<string> = new Set(NOTIFICATION_RECIPIENTS);

export function isNotificationChannel(
  value: unknown,
): value is NotificationChannel {
  return typeof value === "string" && CHANNEL_SET.has(value);
}

export function isNotificationRecipient(
  value: unknown,
): value is NotificationRecipient {
  return typeof value === "string" && RECIPIENT_SET.has(value);
}

/**
 * The routes for a status, as a copy-free list of who and how.
 *
 * The builders stay in the table and never travel through this function, so a
 * caller that only needs recipients cannot accidentally depend on copy.
 */
export function notificationRoutes(status: OrderStatus): readonly {
  recipient: NotificationRecipient;
  channels: readonly NotificationChannel[];
}[] {
  return ROUTES[status].map(({ recipient, channels }) => ({ recipient, channels }));
}

/** Everybody who should be told about this status. May be empty. */
export function notificationRecipients(
  status: OrderStatus,
): readonly NotificationRecipient[] {
  return ROUTES[status].map((route) => route.recipient);
}

/** Whether this status tells this party anything at all. */
export function notifies(status: OrderStatus, recipient: NotificationRecipient): boolean {
  return ROUTES[status].some((route) => route.recipient === recipient);
}

/**
 * The channels to use for one party at one status.
 *
 * Returns `[]` for a pair that is genuinely silent, because "no channels" is a
 * real answer at two call sites: the dispatcher skips the row, and the test that
 * proves a party is not told about their own action reads it directly.
 */
export function notificationChannels(
  status: OrderStatus,
  recipient: NotificationRecipient,
): readonly NotificationChannel[] {
  const route = ROUTES[status].find((candidate) => candidate.recipient === recipient);
  return route ? route.channels : [];
}

/**
 * The words for one party at one status.
 *
 * Throws for a silent pair rather than returning an empty string, because every
 * caller is a dispatcher that has just read the route from this same table: a
 * pair with no words means the caller invented a recipient, and a thrown error
 * names it instead of writing a blank notification row.
 */
export function notificationCopy(
  status: OrderStatus,
  recipient: NotificationRecipient,
  context: OrderNotificationContext,
): NotificationCopy {
  const route = ROUTES[status].find((candidate) => candidate.recipient === recipient);
  if (!route) {
    throw new Error(`No notification is sent to ${recipient} when an order is ${status}`);
  }
  return route.build(context);
}
