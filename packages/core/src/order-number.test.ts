import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ORDER_PREFIX_FALLBACK,
  buildOrderNumber,
  formatOrderStamp,
  isOrderNumber,
  orderNumberPrefix,
} from "./order-number.ts";

test("takes up to three letters from a kitchen name", () => {
  assert.equal(orderNumberPrefix("Mama Aisha Kitchen"), "MAM");
  assert.equal(orderNumberPrefix("Suya Spot"), "SUY");
  assert.equal(orderNumberPrefix("mama aisha"), "MAM");
});

test("drops everything that is not a letter rather than replacing it", () => {
  // "Al-Baik 2" is ALBAIK, so the first three letters are ALB and not "AL-".
  assert.equal(orderNumberPrefix("Al-Baik 2"), "ALB");
  assert.equal(orderNumberPrefix("Jo's Place"), "JOS");
});

test("keeps a short name short instead of padding it", () => {
  // Two letters is honest about the kitchen. Padding to three would not be.
  assert.equal(orderNumberPrefix("Jo"), "JO");
  assert.equal(orderNumberPrefix("Y"), "Y");
});

test("falls back when a name has no letters at all", () => {
  assert.equal(orderNumberPrefix("123"), ORDER_PREFIX_FALLBACK);
  assert.equal(orderNumberPrefix("***"), ORDER_PREFIX_FALLBACK);
  assert.equal(orderNumberPrefix(""), ORDER_PREFIX_FALLBACK);
});

test("stamps in West Africa Time, not UTC", () => {
  // 23:15:45 UTC on the 14th is 00:15:45 on the 15th in Kano. The date rolls
  // over, which is the case a UTC stamp would get wrong for a late order.
  assert.equal(formatOrderStamp(new Date("2026-10-14T23:15:45Z")), "1015001545");
});

test("pads every part of the stamp to two digits", () => {
  // 00:00:00 UTC on 1 January is 01:00:00 the same day in Kano.
  assert.equal(formatOrderStamp(new Date("2026-01-01T00:00:00Z")), "0101010000");
});

test("refuses to stamp an invalid date", () => {
  assert.throws(() => formatOrderStamp(new Date("nonsense")), TypeError);
});

test("builds the reference the landing pages trained customers on", () => {
  const number = buildOrderNumber({
    kitchenName: "Mama Aisha Kitchen",
    at: new Date("2026-10-14T23:15:45Z"),
    suffix: "ab",
  });

  assert.equal(number, "MAM-1015001545-AB");
});

test("a suffix must be exactly two letters", () => {
  const at = new Date("2026-10-14T23:15:45Z");

  for (const suffix of ["", "A", "ABC", "A1", "1A", "-A"]) {
    assert.throws(
      () => buildOrderNumber({ kitchenName: "Suya Spot", at, suffix }),
      TypeError,
      `expected ${JSON.stringify(suffix)} to be refused`,
    );
  }
});

test("recognises its own numbers and rejects shapes it could not have produced", () => {
  assert.equal(isOrderNumber("MAM-1015001545-AB"), true);
  assert.equal(isOrderNumber("JO-0101010000-XX"), true);

  // Lower case, a missing part, the wrong separator, and a suffix that is a
  // digit are all things no code path here can emit.
  assert.equal(isOrderNumber("mam-1015001545-AB"), false);
  assert.equal(isOrderNumber("MAM-101500-AB"), false);
  assert.equal(isOrderNumber("MAM1015001545AB"), false);
  assert.equal(isOrderNumber("MAM-1015001545-A1"), false);
  assert.equal(isOrderNumber(""), false);
});
