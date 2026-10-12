/**
 * The order lifecycle. docs/PRODUCT_SPEC.md sections 7.1 and 7.2.
 *
 * The transition table lives here as typed code so an illegal transition is a
 * compile-time or test-time failure rather than a production surprise. Nothing
 * else in the codebase decides that an order may move.
 *
 * Every accepted transition is written to `order_events` with its actor, reason
 * and server timestamp. `orders.status` is only a cache of the last event, kept
 * so the admin live view stays fast. If the two ever disagree, the events win.
 */

export const ORDER_STATUSES = [
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "KITCHEN_ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "RIDER_ASSIGNED",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CUSTOMER_CANCELLED",
  "KITCHEN_REJECTED",
  "ADMIN_CANCELLED",
  "DELIVERY_FAILED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * No transition leaves a terminal status.
 *
 * PRODUCT_SPEC section 7.1 lists DELIVERED under the "Active" heading, but the
 * transition table in 7.2 gives it no outgoing edges, so it is terminal. The
 * table governs and the heading is loose wording.
 */
export const TERMINAL_STATUSES = [
  "DELIVERED",
  "CUSTOMER_CANCELLED",
  "KITCHEN_REJECTED",
  "ADMIN_CANCELLED",
  "DELIVERY_FAILED",
] as const satisfies readonly OrderStatus[];

const TERMINAL_SET: ReadonlySet<OrderStatus> = new Set(TERMINAL_STATUSES);

/**
 * Every edge the product allows. Anything absent is refused.
 *
 * Note what is deliberately missing: RIDER_ASSIGNED has no CUSTOMER_CANCELLED
 * edge. Once food is made and a person is moving, cancellation is an admin
 * decision. That is business rule 5 in PRODUCT_SPEC section 13, encoded here so
 * it cannot drift.
 */
const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING_CONFIRMATION: ["CONFIRMED", "CUSTOMER_CANCELLED", "ADMIN_CANCELLED"],
  CONFIRMED: [
    "KITCHEN_ACCEPTED",
    "KITCHEN_REJECTED",
    "CUSTOMER_CANCELLED",
    "ADMIN_CANCELLED",
  ],
  KITCHEN_ACCEPTED: ["PREPARING", "CUSTOMER_CANCELLED", "ADMIN_CANCELLED"],
  PREPARING: ["READY_FOR_PICKUP", "CUSTOMER_CANCELLED", "ADMIN_CANCELLED"],
  READY_FOR_PICKUP: ["RIDER_ASSIGNED", "CUSTOMER_CANCELLED", "ADMIN_CANCELLED"],
  RIDER_ASSIGNED: ["PICKED_UP", "ADMIN_CANCELLED"],
  PICKED_UP: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERED: [],
  CUSTOMER_CANCELLED: [],
  KITCHEN_REJECTED: [],
  ADMIN_CANCELLED: [],
  DELIVERY_FAILED: [],
};

/**
 * The word for each state, so a rider and an admin read the same one.
 *
 * UX_SPEC section 2 requires a status pill to carry "a consistent colour and
 * label everywhere it appears". The colour is presentation and lives in the
 * design system; the word is a product decision, so it lives here beside the
 * table that defines the states, exactly as the cancellation reason labels live
 * beside their values in `reasons.ts`. Four screens read this: the customer
 * timeline, the kitchen queue, the rider list and the admin console.
 *
 * Typed as a total `Record`, so adding a status without a label is a compile
 * error rather than a blank pill at three in the morning.
 */
export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  PENDING_CONFIRMATION: "Awaiting confirmation",
  CONFIRMED: "Confirmed",
  KITCHEN_ACCEPTED: "Accepted by kitchen",
  PREPARING: "Preparing",
  READY_FOR_PICKUP: "Ready for pickup",
  RIDER_ASSIGNED: "Rider assigned",
  PICKED_UP: "Picked up",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CUSTOMER_CANCELLED: "Cancelled by customer",
  KITCHEN_REJECTED: "Rejected by kitchen",
  ADMIN_CANCELLED: "Cancelled by admin",
  DELIVERY_FAILED: "Delivery failed",
};

/** Every state that is still moving, which is what the admin live view shows. */
export const ACTIVE_STATUSES = ORDER_STATUSES.filter(
  (status) => !TERMINAL_SET.has(status),
) as readonly OrderStatus[];

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_SET.has(status);
}

const STATUS_SET: ReadonlySet<string> = new Set(ORDER_STATUSES);

/**
 * Whether a string that came from outside is one of ours.
 *
 * A status read from a column that is typed `String` in the schema, or from a
 * payload, is not an `OrderStatus` until it has been checked, and casting it is
 * how a label lookup returns `undefined` in production instead of in a test.
 * Narrow with this, then index the label table safely.
 */
export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && STATUS_SET.has(value);
}

/**
 * The four ways an order ends without the customer getting food.
 *
 * Not the same set as the terminal statuses, and the difference is the whole
 * point: DELIVERED is terminal too, but it is the one ending that earned
 * anything. Every revenue figure in the admin interface is "everything except
 * these four", and every failure screen is exactly these four.
 *
 * It lives here rather than in the admin interface because the admin interface
 * asks the question in five places, and five copies of a four-string list is
 * five chances for one of them to be updated and the others not.
 */
export const LOST_STATUSES = [
  "CUSTOMER_CANCELLED",
  "KITCHEN_REJECTED",
  "ADMIN_CANCELLED",
  "DELIVERY_FAILED",
] as const satisfies readonly OrderStatus[];

const LOST_SET: ReadonlySet<OrderStatus> = new Set(LOST_STATUSES);

/** Whether an order ended without a delivery. */
export function isLost(status: OrderStatus): boolean {
  return LOST_SET.has(status);
}

/** Every status this one may move to. Empty for a terminal status. */
export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Throws on an illegal transition. Call before writing an event, never after. */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal order transition: ${from} -> ${to}`);
  }
}
