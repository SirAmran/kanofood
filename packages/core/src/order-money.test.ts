import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeCommission,
  computeOrderTotals,
  computeSettlement,
  deriveOrderMoney,
  parseRateToBasisPoints,
} from "./order-money.ts";

test("an order totals from its snapshots plus the delivery fee", () => {
  const totals = computeOrderTotals(
    [
      { unitPriceKobo: 250000n, quantity: 2 },
      { unitPriceKobo: 100000n, quantity: 1 },
    ],
    100000n,
  );

  assert.equal(totals.subtotalKobo, 600000n);
  assert.equal(totals.deliveryFeeKobo, 100000n);
  assert.equal(totals.discountKobo, 0n);
  assert.equal(totals.totalKobo, 700000n);
});

test("a discount comes off the total, and is zero unless given", () => {
  const totals = computeOrderTotals([{ unitPriceKobo: 500000n, quantity: 1 }], 100000n, 50000n);
  assert.equal(totals.totalKobo, 550000n);
});

test("an order with no lines is refused", () => {
  assert.throws(() => computeOrderTotals([], 100000n), /at least one line/);
});

test("a line must be a whole positive count at a non-negative price", () => {
  // Quantity 0 is a bug upstream, and quietly totalling it to zero would hide
  // that bug inside a number the customer then pays.
  assert.throws(
    () => computeOrderTotals([{ unitPriceKobo: 100n, quantity: 0 }], 0n),
    /positive integer/,
  );
  assert.throws(
    () => computeOrderTotals([{ unitPriceKobo: 100n, quantity: 1.5 }], 0n),
    /positive integer/,
  );
  assert.throws(
    () => computeOrderTotals([{ unitPriceKobo: -100n, quantity: 1 }], 0n),
    /Unit price/,
  );
});

test("fees and discounts cannot be negative", () => {
  const line = [{ unitPriceKobo: 100000n, quantity: 1 }];
  assert.throws(() => computeOrderTotals(line, -1n), /Delivery fee/);
  assert.throws(() => computeOrderTotals(line, 0n, -1n), /Discount/);
});

test("a discount can zero an order but never invert it", () => {
  const line = [{ unitPriceKobo: 100000n, quantity: 1 }];

  const free = computeOrderTotals(line, 50000n, 150000n);
  assert.equal(free.totalKobo, 0n);

  // More discount than the order is worth would mean the platform owes the
  // customer cash on delivery, which this product does not do.
  assert.throws(() => computeOrderTotals(line, 50000n, 150001n), /exceeds the order total/);
});

test("outstanding is expected minus collected, and never stored", () => {
  const nothingYet = deriveOrderMoney(700000n, []);
  assert.deepEqual(nothingYet, {
    expectedKobo: 700000n,
    collectedKobo: 0n,
    outstandingKobo: 700000n,
  });

  const partial = deriveOrderMoney(700000n, [{ amountKobo: 300000n }]);
  assert.equal(partial.outstandingKobo, 400000n);

  const settled = deriveOrderMoney(700000n, [
    { amountKobo: 300000n },
    { amountKobo: 400000n },
  ]);
  assert.equal(settled.collectedKobo, 700000n);
  assert.equal(settled.outstandingKobo, 0n);
});

test("an overpayment shows as a negative outstanding, not as settled", () => {
  const overpaid = deriveOrderMoney(700000n, [{ amountKobo: 750000n }]);
  assert.equal(overpaid.outstandingKobo, -50000n);
});

test("a reversed payment pushes the outstanding back up", () => {
  // The money module documents a negative amount as a reversal, not an error,
  // so the derived figure has to respect one.
  const reversed = deriveOrderMoney(700000n, [
    { amountKobo: 700000n },
    { amountKobo: -700000n },
  ]);
  assert.equal(reversed.collectedKobo, 0n);
  assert.equal(reversed.outstandingKobo, 700000n);
});

test("a commission rate converts to basis points without floating point", () => {
  assert.equal(parseRateToBasisPoints("0"), 0);
  assert.equal(parseRateToBasisPoints("0.0000"), 0);
  assert.equal(parseRateToBasisPoints("0.0001"), 1);
  assert.equal(parseRateToBasisPoints("0.05"), 500);
  assert.equal(parseRateToBasisPoints("0.1000"), 1000);
  assert.equal(parseRateToBasisPoints("1"), 10000);
  assert.equal(parseRateToBasisPoints(" 0.1250 "), 1250);
});

test("an impossible commission rate is refused rather than truncated", () => {
  // Over 100% is not a real arrangement, and silently dropping a digit
  // somebody typed is how a settlement ends up argued about.
  assert.throws(() => parseRateToBasisPoints("1.5"), /above 100%/);
  assert.throws(() => parseRateToBasisPoints("9.9999"), /above 100%/);
  assert.throws(() => parseRateToBasisPoints("0.12345"), /more precision/);
  assert.throws(() => parseRateToBasisPoints("-0.1"), TypeError);
  assert.throws(() => parseRateToBasisPoints("ten percent"), TypeError);
});

test("commission rounds half up, so a long run cannot under-collect", () => {
  // 10% of ₦1,000.
  assert.equal(computeCommission(100000n, 1000), 10000n);

  // The half-kobo cases, which is the whole point of stating a rule.
  assert.equal(computeCommission(5n, 1000), 1n); // 0.5 kobo rounds up
  assert.equal(computeCommission(4n, 1000), 0n); // 0.4 kobo rounds down
  assert.equal(computeCommission(15n, 1000), 2n); // 1.5 kobo rounds up

  assert.equal(computeCommission(100000n, 0), 0n);
  assert.equal(computeCommission(0n, 1000), 0n);
});

test("commission arithmetic refuses rates and amounts that cannot exist", () => {
  assert.throws(() => computeCommission(100n, -1), RangeError);
  assert.throws(() => computeCommission(100n, 10001), RangeError);
  assert.throws(() => computeCommission(100n, 2.5), RangeError);
  assert.throws(() => computeCommission(-100n, 1000), /cannot be negative/);
});

test("a settlement at launch takes nothing, because kitchens join free", () => {
  // commission_rate is zero at launch, PRODUCT_SPEC section 1.
  const launch = computeSettlement({ grossKobo: 5000000n, basisPoints: 0 });
  assert.equal(launch.commissionKobo, 0n);
  assert.equal(launch.netPayableKobo, 5000000n);

  const later = computeSettlement({ grossKobo: 5000000n, basisPoints: 1000 });
  assert.equal(later.commissionKobo, 500000n);
  assert.equal(later.netPayableKobo, 4500000n);

  // The three figures always reconcile.
  assert.equal(
    later.commissionKobo + later.netPayableKobo,
    later.grossKobo,
  );
});
