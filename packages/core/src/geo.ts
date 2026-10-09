/**
 * Delivery zone boundaries. docs/ARCHITECTURE.md section 5 stores a zone's
 * `boundary` as GeoJSON, and quoting a delivery needs to answer one question:
 * is this point inside that shape?
 *
 * Positions are `[longitude, latitude]`, in that order. That is the reverse of
 * how coordinates are normally spoken and is the classic bug in this kind of
 * code, so every function here takes `lng` and `lat` as separate named fields
 * and never a bare pair.
 *
 * No dependency. This is arithmetic, and the project has no room for a geometry
 * library on a 4GB machine.
 *
 * Note the boundary in the database today is a placeholder: the seed writes a
 * polygon marked `_placeholder: true`, so nothing here can be validated against
 * real Kano geography yet. The tests are therefore the only verification that
 * exists, which is part of why they are thorough.
 */

export interface Point {
  readonly lng: number;
  readonly lat: number;
}

/** A GeoJSON position: `[longitude, latitude]`. */
export type Position = readonly [number, number];

/** A closed ring. GeoJSON closes a ring by repeating the first position last. */
export type LinearRing = readonly Position[];

export interface PolygonGeometry {
  readonly type: "Polygon";
  /** The first ring is the outer boundary; any further rings are holes. */
  readonly coordinates: readonly LinearRing[];
}

export interface MultiPolygonGeometry {
  readonly type: "MultiPolygon";
  readonly coordinates: readonly (readonly LinearRing[])[];
}

export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry;

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function isRing(value: unknown): value is LinearRing {
  return (
    Array.isArray(value) &&
    // A GeoJSON ring needs at least four positions to enclose any area.
    value.length >= 4 &&
    value.every(isPosition)
  );
}

function isRingSet(value: unknown): value is readonly LinearRing[] {
  return Array.isArray(value) && value.length >= 1 && value.every(isRing);
}

/**
 * Read a zone `boundary` out of the database. Prisma types a `Json` column as
 * `unknown`, so this is the boundary between untyped storage and typed code and
 * it fails loudly rather than treating a malformed shape as "no zone" — a
 * silently empty zone list would refuse every order in the city.
 */
export function parseAreaGeometry(value: unknown): AreaGeometry {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    throw new TypeError("Zone boundary is not a GeoJSON object");
  }

  const candidate = value as { type: unknown; coordinates?: unknown };

  if (candidate.type === "Polygon") {
    if (!isRingSet(candidate.coordinates)) {
      throw new TypeError("GeoJSON Polygon coordinates are not a ring set");
    }
    return { type: "Polygon", coordinates: candidate.coordinates };
  }

  if (candidate.type === "MultiPolygon") {
    if (
      !Array.isArray(candidate.coordinates) ||
      candidate.coordinates.length < 1 ||
      !candidate.coordinates.every(isRingSet)
    ) {
      throw new TypeError("GeoJSON MultiPolygon coordinates are not a polygon set");
    }
    return { type: "MultiPolygon", coordinates: candidate.coordinates };
  }

  throw new TypeError(
    `Unsupported boundary geometry: ${JSON.stringify(candidate.type)}. ` +
      "Only Polygon and MultiPolygon can describe a delivery zone.",
  );
}

/**
 * Ray casting: count how many times a ray drawn east from the point crosses the
 * ring. Odd means inside.
 *
 * The ray is open at the far end, so a point exactly on the ring's outer edge
 * may read either way. That is acceptable here and is why zone polygons should
 * not share edges — a boundary case falls to whichever zone the arithmetic
 * picks, and `resolveZone` breaks any tie deterministically by priority.
 */
function isPointInRing(ring: LinearRing, point: Point): boolean {
  let inside = false;

  // Walking with the previous position held means the ring does not have to be
  // explicitly closed by the caller; the last edge wraps to the first.
  let previous = ring[ring.length - 1];
  if (!previous) return false;

  for (const current of ring) {
    const [px, py] = previous;
    const [cx, cy] = current;

    const straddlesRay = cy > point.lat !== py > point.lat;
    if (straddlesRay) {
      const crossingLng = ((px - cx) * (point.lat - cy)) / (py - cy) + cx;
      if (point.lng < crossingLng) inside = !inside;
    }

    previous = current;
  }

  return inside;
}

function isPointInPolygon(rings: readonly LinearRing[], point: Point): boolean {
  const outer = rings[0];
  if (!outer) return false;
  if (!isPointInRing(outer, point)) return false;

  // A point inside a hole is outside the polygon. This is what makes a zone
  // with an excluded neighbourhood expressible.
  for (const hole of rings.slice(1)) {
    if (isPointInRing(hole, point)) return false;
  }

  return true;
}

/** True when the point falls inside the shape. Points on an edge are undefined. */
export function isPointInBoundary(geometry: AreaGeometry, point: Point): boolean {
  if (geometry.type === "Polygon") {
    return isPointInPolygon(geometry.coordinates, point);
  }
  return geometry.coordinates.some((rings) => isPointInPolygon(rings, point));
}

/** Mean Earth radius in kilometres, the value the haversine formula expects. */
const EARTH_RADIUS_KM = 6371.0088;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance in kilometres between two points, by the haversine
 * formula.
 *
 * This is the distance a delivery fee band is measured against, so it is the
 * distance from the kitchen to the customer rather than from any zone centre.
 *
 * It is a straight line over a sphere, not a route. That is a deliberate
 * approximation: no routing provider is wired up, the bands are coarse (three
 * of them, kilometres apart), and a straight line errs consistently rather than
 * varying with traffic. ARCHITECTURE.md section 12 leaves room to replace this
 * with a real distance when one is available.
 */
export function haversineKm(from: Point, to: Point): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);

  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  // atan2 rather than asin: the asin form loses precision for small distances,
  // and most deliveries here are a few kilometres.
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
