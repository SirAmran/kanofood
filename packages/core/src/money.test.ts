import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatNaira,
  formatNairaSpoken,
  multiplyKobo,
  negateKobo,
  parseNairaToKobo,
  serialiseJson,
  sumKobo,
} from "./money.ts";

test("parses naira the way a human types it", () => {
  assert.equal(parseNairaToKobo("1000"), 100000n);
  assert.equal(parseNairaToKobo("1,000"), 100000n);
  assert.equal(parseNairaToKobo("1,000.50"), 100050n);
  assert.equal(parseNairaToKobo("₦1,000"), 100000n);
  assert.equal(parseNairaToKobo("0.01"), 1n);
  assert.equal(parseNairaToKobo("250.5"), 25050n);
  assert.equal(parseNairaToKobo("-250"), -25000n);
});

test("refuses anything that is not a naira amount", () => {
  // Three decimal places: kobo cannot represent it, so guessing would lose money.
  assert.throws(() => parseNairaToKobo("1.234"), TypeError);
  assert.throws(() => parseNairaToKobo("abc"), TypeError);
  assert.throws(() => parseNairaToKobo(""), TypeError);
  assert.throws(() => parseNairaToKobo("1.2.3"), TypeError);
});

test("formats kobo, including the boundaries", () => {
  assert.equal(formatNaira(0n), "₦0.00");
  assert.equal(formatNaira(1n), "₦0.01");
  assert.equal(formatNaira(100n), "₦1.00");
  assert.equal(formatNaira(100000n), "₦1,000.00");
  assert.equal(formatNaira(123456789n), "₦1,234,567.89");
  assert.equal(formatNaira(-25000n), "-₦250.00");
});

test("format and parse round-trip, which is what the UI depends on", () => {
  for (const amount of [0n, 1n, 99n, 100n, 99999n, 100000n, 123456789n]) {
    assert.equal(parseNairaToKobo(formatNaira(amount)), amount);
  }
});

test("speaks amounts so a screen reader says naira, not symbols", () => {
  assert.equal(formatNairaSpoken(0n), "0 naira");
  assert.equal(formatNairaSpoken(100000n), "1000 naira");
  assert.equal(formatNairaSpoken(50n), "50 kobo");
  assert.equal(formatNairaSpoken(150n), "1 naira 50 kobo");
  assert.equal(formatNairaSpoken(-150n), "minus 1 naira 50 kobo");
});

test("summing is the only safe total, and an empty sum is zero", () => {
  assert.equal(sumKobo([]), 0n);
  assert.equal(sumKobo([100n, 250n, 1n]), 351n);
});

test("line totals multiply only by a whole count", () => {
  assert.equal(multiplyKobo(25000n, 3), 75000n);
  assert.equal(multiplyKobo(25000n, 0), 0n);
  assert.throws(() => multiplyKobo(25000n, 1.5), RangeError);
  assert.throws(() => multiplyKobo(25000n, -1), RangeError);
});

test("negating names a refund rather than raising an error", () => {
  assert.equal(negateKobo(100n), -100n);
});

test("money serialises as digits, because JSON numbers are doubles", () => {
  // JSON.stringify throws outright on a bigint. That is the whole reason
  // serialiseJson exists, so prove both halves of that claim.
  assert.throws(() => JSON.stringify({ amount: 100n }));

  const payload = { amount: 100n, nested: { fee: 250n } };
  assert.equal(serialiseJson(payload), '{"amount":"100","nested":{"fee":"250"}}');

  // A string, never a JSON number: past 2^53 a JSON number silently loses
  // precision, and this project's aggregates are expected to get there.
  const huge = JSON.parse(serialiseJson({ amount: 9007199254740993n })) as {
    amount: unknown;
  };
  assert.equal(typeof huge.amount, "string");
  assert.equal(huge.amount, "9007199254740993");
});
