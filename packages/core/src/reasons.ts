/**
 * Why an order stopped. docs/PRODUCT_SPEC.md section 8.
 *
 * The specification enumerates the customer's cancellation reasons exactly, so
 * they are reproduced here verbatim as values with their display labels kept
 * beside them — the label is what the customer picks and what the kitchen is
 * shown, and keeping the pair together stops the two drifting.
 *
 * **Spec gap, deliberately not filled.** Section 8 says a kitchen rejection
 * "requires a reason" and then never lists one, while the customer's six are
 * spelled out. No rejection reasons are invented here. Inventing them would put
 * fabricated product decisions into the one module whose job is to hold real
 * ones, and a wrong list is worse than an absent one because it looks decided.
 * Section 8 needs to carry the list before the kitchen interface is built.
 */

import type { OrderStatus } from "./order-status.ts";
import { canTransition } from "./order-status.ts";

export const CANCELLATION_REASONS = [
  "ORDERED_BY_MISTAKE",
  "CHANGED_MIND",
  "TAKING_TOO_LONG",
  "KITCHEN_UNAVAILABLE",
  "DELIVERY_TAKING_TOO_LONG",
  "OTHER",
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

/** The wording the customer sees, kept exactly as section 8 states it. */
export const CANCELLATION_REASON_LABELS: Readonly<
  Record<CancellationReason, string>
> = {
  ORDERED_BY_MISTAKE: "Ordered by mistake",
  CHANGED_MIND: "Changed my mind",
  TAKING_TOO_LONG: "Taking too long",
  KITCHEN_UNAVAILABLE: "Kitchen unavailable",
  DELIVERY_TAKING_TOO_LONG: "Delivery taking too long",
  OTHER: "Other",
};

const CANCELLATION_REASON_SET: ReadonlySet<string> = new Set(CANCELLATION_REASONS);

export function isCancellationReason(value: unknown): value is CancellationReason {
  return typeof value === "string" && CANCELLATION_REASON_SET.has(value);
}

/**
 * Transitions that are only meaningful with a stated reason.
 *
 * A customer cancelling and a kitchen rejecting both change what somebody
 * planned their day around, so both must say why. An admin cancelling does not
 * appear here: section 8 gives the admin three possible follow-up actions and
 * makes none of them automatic, so the admin's judgement is already the record.
 */
const REASON_REQUIRED: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "CUSTOMER_CANCELLED",
  "KITCHEN_REJECTED",
]);

export function requiresReason(to: OrderStatus): boolean {
  return REASON_REQUIRED.has(to);
}

/** Throws when a transition needs a reason and none was given. */
export function assertReasonProvided(
  to: OrderStatus,
  reason: string | null | undefined,
): void {
  if (requiresReason(to) && !reason?.trim()) {
    throw new Error(`A reason is required to move an order to ${to}`);
  }
}

/**
 * Whether the customer may still cancel from this status.
 *
 * Business rule 5, PRODUCT_SPEC section 13: cancellation after a rider is
 * assigned is an admin action only. The transition table already refuses the
 * edge, so this is a named reading of it rather than a second rule — the
 * distinction matters, because two sources of truth for one rule is how they
 * drift apart.
 */
export function customerMayCancel(from: OrderStatus): boolean {
  return canTransition(from, "CUSTOMER_CANCELLED");
}
