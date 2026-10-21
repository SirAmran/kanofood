import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CANCELLATION_REASON_LABELS,
  CANCELLATION_REASONS,
  KITCHEN_REJECTION_REASON_LABELS,
  KITCHEN_REJECTION_REASONS,
  assertReasonProvided,
  customerMayCancel,
  isCancellationReason,
  isKitchenRejectionReason,
  requiresReason,
} from "./reasons.ts";

test("the six cancellation reasons match the specification wording", () => {
  // Transcribed from PRODUCT_SPEC section 8, which lists these exactly. The
  // label is what the customer picks, so it is checked character for character.
  assert.deepEqual(
    CANCELLATION_REASONS.map((reason) => CANCELLATION_REASON_LABELS[reason]),
    [
      "Ordered by mistake",
      "Changed my mind",
      "Taking too long",
      "Kitchen unavailable",
      "Delivery taking too long",
      "Other",
    ],
  );
  assert.equal(CANCELLATION_REASONS.length, 6);
});

test("a reason is validated against the known set", () => {
  assert.equal(isCancellationReason("CHANGED_MIND"), true);
  assert.equal(isCancellationReason("changed_mind"), false);
  assert.equal(isCancellationReason("SOMETHING_ELSE"), false);
  assert.equal(isCancellationReason(undefined), false);
  assert.equal(isCancellationReason(3), false);
});

test("the kitchen rejection reasons are four, labelled, and separate from the customer's", () => {
  // A decision taken 2026-10-20 because PRODUCT_SPEC section 8 names no list.
  assert.deepEqual(
    KITCHEN_REJECTION_REASONS.map((reason) => KITCHEN_REJECTION_REASON_LABELS[reason]),
    ["An item sold out", "Too busy right now", "Kitchen is closing", "Other"],
  );
  assert.equal(KITCHEN_REJECTION_REASONS.length, 4);

  assert.equal(isKitchenRejectionReason("ITEMS_UNAVAILABLE"), true);
  assert.equal(isKitchenRejectionReason("OTHER"), true);
  assert.equal(isKitchenRejectionReason("CHANGED_MIND"), false);
  assert.equal(isKitchenRejectionReason(undefined), false);
});

test("a reason is required to cancel and to reject, and nowhere else", () => {
  assert.equal(requiresReason("CUSTOMER_CANCELLED"), true);
  assert.equal(requiresReason("KITCHEN_REJECTED"), true);

  assert.equal(requiresReason("ADMIN_CANCELLED"), false);
  assert.equal(requiresReason("DELIVERY_FAILED"), false);
  assert.equal(requiresReason("DELIVERED"), false);
});

test("assertReasonProvided refuses a missing, empty or whitespace reason", () => {
  assert.doesNotThrow(() => assertReasonProvided("CUSTOMER_CANCELLED", "CHANGED_MIND"));
  assert.throws(() => assertReasonProvided("CUSTOMER_CANCELLED", null), /reason is required/);
  assert.throws(() => assertReasonProvided("CUSTOMER_CANCELLED", undefined), /reason is required/);
  assert.throws(() => assertReasonProvided("KITCHEN_REJECTED", "   "), /reason is required/);

  // An admin cancellation carries its own record of judgement, so no reason.
  assert.doesNotThrow(() => assertReasonProvided("ADMIN_CANCELLED", null));
});

test("a customer may cancel until a rider is assigned, and not after", () => {
  assert.equal(customerMayCancel("PENDING_CONFIRMATION"), true);
  assert.equal(customerMayCancel("CONFIRMED"), true);
  assert.equal(customerMayCancel("KITCHEN_ACCEPTED"), true);
  assert.equal(customerMayCancel("PREPARING"), true);
  assert.equal(customerMayCancel("READY_FOR_PICKUP"), true);

  // Business rule 5: past this point it is an admin decision.
  assert.equal(customerMayCancel("RIDER_ASSIGNED"), false);
  assert.equal(customerMayCancel("PICKED_UP"), false);
  assert.equal(customerMayCancel("OUT_FOR_DELIVERY"), false);
  assert.equal(customerMayCancel("DELIVERED"), false);
});
