/**
 * Why an order stopped. docs/PRODUCT_SPEC.md section 8.
 *
 * The specification enumerates the customer's cancellation reasons exactly, so
 * they are reproduced here verbatim as values with their display labels kept
 * beside them — the label is what the customer picks and what the kitchen is
 * shown, and keeping the pair together stops the two drifting.
 *
 * **Spec gap, closed by decision on 2026-10-20.** Section 8 says a kitchen
 * rejection "requires a reason" and then never lists one, while the customer's
 * six are spelled out. The kitchen interface cannot be built without the list:
 * reject is one of the two largest controls on the order queue. Four reasons are
 * decided below and marked as a decision rather than as specification wording.
 * Section 8 still needs to carry them; until it does, this file is the record.
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
 * Why a kitchen turned an order down.
 *
 * **A decision, not a transcription.** PRODUCT_SPEC section 8 requires the
 * reason and lists none, so these four were chosen for the kitchen interface on
 * 2026-10-20 and are recorded here as the decision they are. The shape follows
 * the customer's list: short codes with the wording an operator sees kept beside
 * them, and an `OTHER` escape so a real situation the list did not anticipate is
 * never blocked by the form.
 *
 * Kept to four because the operator picks one on a phone, mid-service, and each
 * additional choice is a second of thinking while a customer waits. The reasons
 * are not analytics categories to grow: the platform needs to know whether the
 * kitchen could take the order (sold out, too busy, closing), not a taxonomy.
 */
export const KITCHEN_REJECTION_REASONS = [
  "ITEMS_UNAVAILABLE",
  "TOO_BUSY",
  "CLOSING",
  "OTHER",
] as const;

export type KitchenRejectionReason = (typeof KITCHEN_REJECTION_REASONS)[number];

export const KITCHEN_REJECTION_REASON_LABELS: Readonly<
  Record<KitchenRejectionReason, string>
> = {
  ITEMS_UNAVAILABLE: "An item sold out",
  TOO_BUSY: "Too busy right now",
  CLOSING: "Kitchen is closing",
  OTHER: "Other",
};

const KITCHEN_REJECTION_REASON_SET: ReadonlySet<string> = new Set(
  KITCHEN_REJECTION_REASONS,
);

export function isKitchenRejectionReason(
  value: unknown,
): value is KitchenRejectionReason {
  return typeof value === "string" && KITCHEN_REJECTION_REASON_SET.has(value);
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
