import { test } from "node:test";
import assert from "node:assert/strict";

import { isPointInBoundary, parseAreaGeometry } from "./geo.ts";

/** A square over Kano: lng 8.5 to 8.6, lat 12.0 to 12.1. Closed, as GeoJSON requires. */
const SQUARE = parseAreaGeometry({
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

test("a point inside the square is inside, one outside is outside", () => {
  assert.equal(isPointInBoundary(SQUARE, { lng: 8.55, lat: 12.05 }), true);
  assert.equal(isPointInBoundary(SQUARE, { lng: 8.4, lat: 12.05 }), false);
  assert.equal(isPointInBoundary(SQUARE, { lng: 8.55, lat: 11.9 }), false);
  assert.equal(isPointInBoundary(SQUARE, { lng: 9.0, lat: 13.0 }), false);
});

test("longitude and latitude are not interchangeable", () => {
  // The single most common bug in this kind of code. The swapped point is a
  // real coordinate pair in the other order, and it must land outside.
  assert.equal(isPointInBoundary(SQUARE, { lng: 12.05, lat: 8.55 }), false);
});

test("a ring does not have to be closed explicitly", () => {
  // The walker wraps the last position to the first, so an unclosed ring (the
  // minimum four positions) still describes an area.
  const unclosed = parseAreaGeometry({
    type: "Polygon",
    coordinates: [
      [
        [8.5, 12.0],
        [8.6, 12.0],
        [8.6, 12.1],
        [8.5, 12.1],
      ],
    ],
  });

  assert.equal(isPointInBoundary(unclosed, { lng: 8.55, lat: 12.05 }), true);
  assert.equal(isPointInBoundary(unclosed, { lng: 8.9, lat: 12.05 }), false);
});

test("a hole is outside the polygon", () => {
  // This is what lets an admin carve an excluded neighbourhood out of a zone.
  const withHole = parseAreaGeometry({
    type: "Polygon",
    coordinates: [
      [
        [8.5, 12.0],
        [8.6, 12.0],
        [8.6, 12.1],
        [8.5, 12.1],
        [8.5, 12.0],
      ],
      [
        [8.53, 12.03],
        [8.57, 12.03],
        [8.57, 12.07],
        [8.53, 12.07],
        [8.53, 12.03],
      ],
    ],
  });

  assert.equal(isPointInBoundary(withHole, { lng: 8.55, lat: 12.05 }), false);
  // Inside the outer ring but outside the hole is still inside the zone.
  assert.equal(isPointInBoundary(withHole, { lng: 8.51, lat: 12.01 }), true);
});

test("a multipolygon is inside if any of its parts contains the point", () => {
  const twoParts = parseAreaGeometry({
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [8.5, 12.0],
          [8.6, 12.0],
          [8.6, 12.1],
          [8.5, 12.1],
          [8.5, 12.0],
        ],
      ],
      [
        [
          [8.7, 12.2],
          [8.8, 12.2],
          [8.8, 12.3],
          [8.7, 12.3],
          [8.7, 12.2],
        ],
      ],
    ],
  });

  assert.equal(isPointInBoundary(twoParts, { lng: 8.55, lat: 12.05 }), true);
  assert.equal(isPointInBoundary(twoParts, { lng: 8.75, lat: 12.25 }), true);
  // The gap between the two parts is not covered.
  assert.equal(isPointInBoundary(twoParts, { lng: 8.65, lat: 12.15 }), false);
});

test("malformed boundaries are refused loudly, not read as an empty zone", () => {
  // A silently empty zone list would refuse every order in the city, so this
  // boundary between untyped Json and typed code has to fail hard.
  assert.throws(() => parseAreaGeometry(null), TypeError);
  assert.throws(() => parseAreaGeometry("Polygon"), TypeError);
  assert.throws(() => parseAreaGeometry({ type: "Point", coordinates: [8.5, 12.0] }), TypeError);
  assert.throws(
    () =>
      parseAreaGeometry({
        type: "Polygon",
        // Three positions cannot enclose an area.
        coordinates: [
          [
            [8.5, 12.0],
            [8.6, 12.0],
            [8.5, 12.0],
          ],
        ],
      }),
    TypeError,
  );
  assert.throws(
    () =>
      parseAreaGeometry({
        type: "Polygon",
        coordinates: [[[8.5, 12.0], [8.6, "x"], [8.6, 12.1], [8.5, 12.0]]],
      }),
    TypeError,
  );
  assert.throws(() => parseAreaGeometry({ type: "MultiPolygon", coordinates: [] }), TypeError);
});
