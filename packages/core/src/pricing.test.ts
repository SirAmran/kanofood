import { test } from "node:test";
import assert from "node:assert/strict";

import { parseAreaGeometry } from "./geo.ts";
import type { DeliveryZone, FeeBand } from "./pricing.ts";
import {
  findFeeBand,
  quoteDelivery,
  resolveDeliveryFee,
  resolveZone,
  validateFeeBands,
} from "./pricing.ts";

/** The three tiers the seed writes: 0-3, 3-5, 5-8 km, at ₦1,000 / ₦1,500 / ₦2,000. */
const BANDS: readonly FeeBand[] = [
  { minKm: 0, maxKm: 3, feeKobo: 100000n },
  { minKm: 3, maxKm: 5, feeKobo: 150000n },
  { minKm: 5, maxKm: 8, feeKobo: 200000n },
];

const KANO = parseAreaGeometry({
  type: "Polygon",
  coordinates: [
    [
      [8.5, 12.0],
      [8.6, 12.0],
      [8.6, 12.1],
      [8.5, 12.1],
      [8.5, 12.0],
    ],
  ],
});

function zone(overrides: Partial<DeliveryZone> = {}): DeliveryZone {
  return {
    slug: "kano-metropolitan",
    name: "Kano Metropolitan",
    boundary: KANO,
    baseFeeKobo: 100000n,
    paymentRequirement: "cod_allowed",
    isActive: true,
    priority: 0,
    feeBands: BANDS,
    ...overrides,
  };
}

test("band edges are half-open, except the highest band", () => {
  const at = (km: number) => findFeeBand(BANDS, km)?.feeKobo;

  assert.equal(at(0), 100000n);
  assert.equal(at(2.99), 100000n);
  // 3 km belongs to the second band, not both.
  assert.equal(at(3), 150000n);
  assert.equal(at(4.99), 150000n);
  assert.equal(at(5), 200000n);
  assert.equal(at(7.99), 200000n);
  // The highest band includes its own upper edge, so 8 km still has a price.
  assert.equal(at(8), 200000n);

  // Past every band there is no band, and the base fee takes over.
  assert.equal(at(8.01), undefined);
  assert.equal(at(50), undefined);
});

test("band order in the input does not matter", () => {
  const reversed = [...BANDS].reverse();
  assert.equal(findFeeBand(reversed, 4)?.feeKobo, 150000n);
  assert.equal(findFeeBand(reversed, 8)?.feeKobo, 200000n);
});

test("a negative or non-finite distance is a programming error, not a quote", () => {
  assert.throws(() => findFeeBand(BANDS, -1), RangeError);
  assert.throws(() => findFeeBand(BANDS, Number.NaN), RangeError);
  assert.throws(() => findFeeBand(BANDS, Number.POSITIVE_INFINITY), RangeError);
});

test("overlapping bands resolve to the lower one, deterministically", () => {
  const overlapping: readonly FeeBand[] = [
    { minKm: 0, maxKm: 5, feeKobo: 100000n },
    { minKm: 3, maxKm: 8, feeKobo: 200000n },
  ];
  assert.equal(findFeeBand(overlapping, 4)?.feeKobo, 100000n);
});

test("bad band data is reported in words rather than thrown", () => {
  // An admin's typo must not take the storefront down, so quoting keeps
  // answering and the fault surfaces where it can actually be fixed.
  const problems = validateFeeBands([
    { minKm: 5, maxKm: 3, feeKobo: 100000n },
    { minKm: 0, maxKm: 5, feeKobo: -1n },
  ]);

  assert.equal(problems.length, 2);
  assert.ok(problems.some((problem) => /5-3 km is empty or inverted/.test(problem)));
  assert.ok(problems.some((problem) => /0-5 km has a negative fee/.test(problem)));

  assert.deepEqual(validateFeeBands(BANDS), []);
});

test("overlapping bands are reported, because two rows can price one distance", () => {
  const problems = validateFeeBands([
    { minKm: 0, maxKm: 5, feeKobo: 100000n },
    { minKm: 4, maxKm: 8, feeKobo: 200000n },
  ]);

  assert.deepEqual(problems, ["0-5 km overlaps 4-8 km"]);
});

test("bands that merely touch at an edge are not an overlap", () => {
  // 0-3 and 3-5 share the 3 km edge by design: the edge belongs to the upper
  // band, so consecutive tiers are legal data rather than a fault.
  assert.deepEqual(validateFeeBands(BANDS), []);
});

test("a matching band prices the delivery, otherwise the base fee does", () => {
  const inBand = resolveDeliveryFee(zone(), 4);
  assert.equal(inBand.feeKobo, 150000n);
  assert.equal(inBand.pricedBy, "band");
  assert.equal(inBand.band?.maxKm, 5);

  const pastBands = resolveDeliveryFee(zone(), 9);
  assert.equal(pastBands.feeKobo, 100000n);
  assert.equal(pastBands.pricedBy, "base_fee");
  assert.equal(pastBands.band, null);
});

test("zone resolution picks the containing active zone, highest priority first", () => {
  const general = zone({ slug: "kano-metropolitan", priority: 0 });
  const enclave = zone({ slug: "sabon-gari", priority: 10 });
  const point = { lng: 8.55, lat: 12.05 };

  assert.equal(resolveZone([general, enclave], point)?.slug, "sabon-gari");
  assert.equal(resolveZone([enclave, general], point)?.slug, "sabon-gari");
});

test("priority ties break on slug, so a point never quotes two ways", () => {
  const a = zone({ slug: "alpha", priority: 5 });
  const b = zone({ slug: "beta", priority: 5 });
  const point = { lng: 8.55, lat: 12.05 };

  const first = resolveZone([a, b], point)?.slug;
  const second = resolveZone([b, a], point)?.slug;
  assert.equal(first, "alpha");
  assert.equal(second, "alpha");
});

test("inactive zones are ignored, and a point in none resolves to nothing", () => {
  const closedZone = zone({ isActive: false });
  assert.equal(resolveZone([closedZone], { lng: 8.55, lat: 12.05 }), undefined);
  assert.equal(resolveZone([zone()], { lng: 9.9, lat: 12.05 }), undefined);
});

test("quoting returns the price and refuses to invent one outside every zone", () => {
  const quote = quoteDelivery({
    zones: [zone()],
    point: { lng: 8.55, lat: 12.05 },
    distanceKm: 1.5,
  });

  assert.equal(quote.ok, true);
  if (quote.ok) {
    assert.equal(quote.feeKobo, 100000n);
    assert.equal(quote.zoneSlug, "kano-metropolitan");
    assert.equal(quote.paymentRequirement, "cod_allowed");
    assert.equal(quote.pricedBy, "band");
  }

  const outside = quoteDelivery({
    zones: [zone()],
    point: { lng: 9.9, lat: 12.05 },
    distanceKm: 1.5,
  });
  assert.equal(outside.ok, false);
  if (!outside.ok) assert.equal(outside.reason, "no_zone");
});

test("a prepaid-only zone carries that requirement through the quote", () => {
  const quote = quoteDelivery({
    zones: [zone({ paymentRequirement: "prepaid_required" })],
    point: { lng: 8.55, lat: 12.05 },
    distanceKm: 20,
  });

  assert.equal(quote.ok, true);
  if (quote.ok) {
    assert.equal(quote.paymentRequirement, "prepaid_required");
    assert.equal(quote.pricedBy, "base_fee");
  }
});
