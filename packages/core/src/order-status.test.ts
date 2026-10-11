import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVE_STATUSES,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  TERMINAL_STATUSES,
  allowedTransitions,
  assertTransition,
  canTransition,
  isTerminal,
} from "./order-status.ts";
import type { OrderStatus } from "./order-status.ts";

/** PRODUCT_SPEC section 7.2, transcribed independently of the implementation. */
const ALLOWED: ReadonlyArray<readonly [OrderStatus, readonly OrderStatus[]]> = [
  [
    "PENDING_CONFIRMATION",
    ["CONFIRMED", "CUSTOMER_CANCELLED", "ADMIN_CANCELLED"],
  ],
  [
    "CONFIRMED",
    ["KITCHEN_ACCEPTED", "KITCHEN_REJECTED", "CUSTOMER_CANCELLED", "ADMIN_CANCELLED"],
  ],
  ["KITCHEN_ACCEPTED", ["PREPARING", "CUSTOMER_CANCELLED", "ADMIN_CANCELLED"]],
  ["PREPARING", ["READY_FOR_PICKUP", "CUSTOMER_CANCELLED", "ADMIN_CANCELLED"]],
  ["READY_FOR_PICKUP", ["RIDER_ASSIGNED", "CUSTOMER_CANCELLED", "ADMIN_CANCELLED"]],
  ["RIDER_ASSIGNED", ["PICKED_UP", "ADMIN_CANCELLED"]],
  ["PICKED_UP", ["OUT_FOR_DELIVERY"]],
  ["OUT_FOR_DELIVERY", ["DELIVERED", "DELIVERY_FAILED"]],
  ["DELIVERED", []],
  ["CUSTOMER_CANCELLED", []],
  ["KITCHEN_REJECTED", []],
  ["ADMIN_CANCELLED", []],
  ["DELIVERY_FAILED", []],
];

test("every edge the spec allows is allowed, and nothing else is", () => {
  for (const from of ORDER_STATUSES) {
    const expected = ALLOWED.find(([status]) => status === from)?.[1];
    assert.ok(expected, `${from} is missing from the transcription`);

    const actual = [...allowedTransitions(from)].sort();
    assert.deepEqual(actual, [...expected].sort(), `edges differ for ${from}`);

    // And the negative half: every other status must be refused.
    for (const to of ORDER_STATUSES) {
      assert.equal(
        canTransition(from, to),
        expected.includes(to),
        `${from} -> ${to} disagrees with the spec`,
      );
    }
  }
});

test("all thirteen statuses are covered by the table", () => {
  assert.equal(ORDER_STATUSES.length, 13);
  for (const status of ORDER_STATUSES) {
    assert.doesNotThrow(() => allowedTransitions(status));
  }
});

test("terminal means terminal: nothing leaves these", () => {
  for (const status of TERMINAL_STATUSES) {
    assert.deepEqual(allowedTransitions(status), []);
    assert.equal(isTerminal(status), true);
  }
});

test("every non-terminal status can still move somewhere", () => {
  for (const status of ORDER_STATUSES) {
    if (isTerminal(status)) continue;
    assert.ok(
      allowedTransitions(status).length > 0,
      `${status} is not terminal but has no way out`,
    );
  }
});

test("business rule 5: a customer cannot cancel once a rider is assigned", () => {
  // PRODUCT_SPEC section 13 rule 5. Encoded as an explicit test because it is
  // the one edge whose absence is a deliberate business decision, not a gap.
  assert.equal(canTransition("RIDER_ASSIGNED", "CUSTOMER_CANCELLED"), false);
  assert.equal(canTransition("PICKED_UP", "CUSTOMER_CANCELLED"), false);
  assert.equal(canTransition("OUT_FOR_DELIVERY", "CUSTOMER_CANCELLED"), false);

  // But the admin still can, up to the point the food moves.
  assert.equal(canTransition("RIDER_ASSIGNED", "ADMIN_CANCELLED"), true);
  assert.equal(canTransition("PICKED_UP", "ADMIN_CANCELLED"), false);
});

test("no order skips a state", () => {
  // Rule 2, PRODUCT_SPEC section 13. Walking the canonical order proves the
  // only edges are a single forward step or a jump to a failed end.
  const FORWARD: readonly OrderStatus[] = [
    "PENDING_CONFIRMATION",
    "CONFIRMED",
    "KITCHEN_ACCEPTED",
    "PREPARING",
    "READY_FOR_PICKUP",
    "RIDER_ASSIGNED",
    "PICKED_UP",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
  ];
  const UNSUCCESSFUL: readonly OrderStatus[] = [
    "CUSTOMER_CANCELLED",
    "KITCHEN_REJECTED",
    "ADMIN_CANCELLED",
    "DELIVERY_FAILED",
  ];

  for (const from of FORWARD) {
    const next = FORWARD[FORWARD.indexOf(from) + 1];
    for (const to of allowedTransitions(from)) {
      const isOneStepForward = to === next;
      const isFailure = UNSUCCESSFUL.includes(to);
      assert.ok(
        isOneStepForward || isFailure,
        `${from} -> ${to} is neither one step forward nor a failed end`,
      );
    }
  }
});

test("assertTransition refuses an illegal move before anything is written", () => {
  assert.doesNotThrow(() => assertTransition("PENDING_CONFIRMATION", "CONFIRMED"));
  assert.throws(
    () => assertTransition("PENDING_CONFIRMATION", "PREPARING"),
    /Illegal order transition: PENDING_CONFIRMATION -> PREPARING/,
  );
  assert.throws(() => assertTransition("DELIVERED", "PREPARING"), /Illegal/);
});

test("every status has a label, and the four interfaces read the same word", () => {
  // UX_SPEC section 2: the customer, the kitchen, the rider and the admin must
  // read the same words for the same state. One table is how that stays true.
  for (const status of ORDER_STATUSES) {
    const label = ORDER_STATUS_LABELS[status];
    assert.equal(typeof label, "string", `${status} has no label`);
    assert.ok(label.trim().length > 0, `${status} has an empty label`);
  }

  const labels = ORDER_STATUSES.map((status) => ORDER_STATUS_LABELS[status]);
  assert.equal(new Set(labels).size, labels.length, "two statuses share a label");

  // A label is prose, not the enum: an operator should never be shown
  // READY_FOR_PICKUP, and a screen reader should never spell out an underscore.
  for (const label of labels) {
    assert.ok(!label.includes("_"), `label leaks the enum: ${label}`);
    assert.notEqual(label, label.toUpperCase(), `label is shouting: ${label}`);
  }
});

test("active means not terminal, and the failed ends are not active", () => {
  assert.equal(ACTIVE_STATUSES.length, ORDER_STATUSES.length - TERMINAL_STATUSES.length);
  for (const status of ACTIVE_STATUSES) {
    assert.equal(isTerminal(status), false, `${status} is terminal but listed as active`);
  }
  for (const status of TERMINAL_STATUSES) {
    assert.ok(!ACTIVE_STATUSES.includes(status), `${status} is terminal but listed as active`);
  }
  // DELIVERED is terminal and so is every failure, which is the whole point of
  // the live view: it shows work in flight and nothing that has finished.
  assert.ok(!ACTIVE_STATUSES.includes("DELIVERED"));
  assert.ok(!ACTIVE_STATUSES.includes("DELIVERY_FAILED"));
});
