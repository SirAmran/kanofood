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

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_SET.has(status);
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
