/**
 * Delivery pricing. docs/PRODUCT_SPEC.md section 11, docs/ARCHITECTURE.md
 * section 5.
 *
 * The governing rule is that **no fee is ever computed in code**. Every naira
 * the customer pays comes from a row an admin can edit: a fee band's
 * `fee_kobo`, or the zone's `base_fee_kobo`. This module only chooses which row
 * applies. That is why nothing here multiplies money and nothing here rounds.
 *
 * Two behaviours the specification does not settle, decided here and flagged as
 * spec gaps rather than absorbed silently:
 *
 * 1. **Band edges.** The spec writes bands as "0 to 3 km, 3 to 5 km, 5 to 8 km"
 *    without saying whether 3 km is in the first band or the second, or whether
 *    8 km is inside the last. Chosen: every band is half-open, `min <= d < max`,
 *    except the highest band, whose `max` is inclusive. So 3 km prices in the
 *    3-to-5 band and 8 km still prices in the 5-to-8 band.
 * 2. **How `base_fee_kobo` and the bands combine.** Read as a fallback: if a
 *    distance matches no band, the zone's base fee applies. That is the only
 *    reading that gives the base fee a job at all.
 */

import type { AreaGeometry, Point } from "./geo.ts";
import { isPointInBoundary } from "./geo.ts";
import type { Kobo } from "./money.ts";

/** A distance tier inside a zone. Stored as `Decimal(6,2)` kilometres. */
export interface FeeBand {
  readonly minKm: number;
  readonly maxKm: number;
  readonly feeKobo: Kobo;
}

/**
 * A zone's payment requirement. `prepaid_required` is how an outside-zone order
 * is refused cash on delivery; it exists per zone because the specification
 * makes it a zone property, not a global switch.
 */
export type PaymentRequirement = "cod_allowed" | "prepaid_required";

/**
 * The zone shape this module needs. Deliberately structural rather than the
 * Prisma model, so `packages/core` keeps its zero dependencies and a caller can
 * pass a row, a test fixture or an API payload without adapting it.
 */
export interface DeliveryZone {
  readonly slug: string;
  readonly name: string;
  readonly boundary: AreaGeometry;
  readonly baseFeeKobo: Kobo;
  readonly paymentRequirement: PaymentRequirement;
  readonly isActive: boolean;
  readonly priority: number;
  readonly feeBands: readonly FeeBand[];
}

export interface DeliveryQuoteOk {
  readonly ok: true;
  readonly zoneSlug: string;
  readonly zoneName: string;
  readonly feeKobo: Kobo;
  readonly paymentRequirement: PaymentRequirement;
  /** Which row priced this, so a surprising quote can be traced to admin data. */
  readonly pricedBy: "band" | "base_fee";
  readonly band: FeeBand | null;
}

export interface DeliveryQuoteRefused {
  readonly ok: false;
  readonly reason: "no_zone";
}

export type DeliveryQuote = DeliveryQuoteOk | DeliveryQuoteRefused;

function assertDistance(distanceKm: number): void {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new RangeError(`Distance must be a non-negative number of km, got ${distanceKm}`);
  }
}

/**
 * Report what is wrong with a set of bands, in words an admin can act on.
 *
 * This deliberately returns problems instead of throwing. A malformed band is
 * an admin's typo, and a typo must not take the storefront down: quoting still
 * answers with whatever the bands do match, and the fault shows up where it can
 * be fixed.
 */
export function validateFeeBands(bands: readonly FeeBand[]): string[] {
  const problems: string[] = [];
  const sorted = [...bands].sort((a, b) => a.minKm - b.minKm);

  sorted.forEach((band, index) => {
    if (!(band.minKm < band.maxKm)) {
      problems.push(`${band.minKm}-${band.maxKm} km is empty or inverted`);
    }
    if (band.feeKobo < 0n) {
      problems.push(`${band.minKm}-${band.maxKm} km has a negative fee`);
    }

    const next = sorted[index + 1];
    if (next && next.minKm < band.maxKm) {
      problems.push(
        `${band.minKm}-${band.maxKm} km overlaps ${next.minKm}-${next.maxKm} km`,
      );
    }
  });

  return problems;
}

/**
 * The band a distance falls in, or `undefined` if it falls in a gap or past the
 * highest band. Bands are matched in ascending order, so if an admin's data
 * does overlap, the lower band wins and the result is at least stable.
 */
export function findFeeBand(
  bands: readonly FeeBand[],
  distanceKm: number,
): FeeBand | undefined {
  assertDistance(distanceKm);

  const sorted = [...bands]
    .filter((band) => band.minKm < band.maxKm)
    .sort((a, b) => a.minKm - b.minKm);

  const highest = sorted[sorted.length - 1];

  return sorted.find((band) => {
    if (distanceKm < band.minKm) return false;
    // Only the highest band includes its own upper edge; the rest are
    // half-open so consecutive bands cannot both claim a shared edge.
    return band === highest ? distanceKm <= band.maxKm : distanceKm < band.maxKm;
  });
}

/** The price of this zone at this distance: a band fee, or the base fee. */
export function resolveDeliveryFee(
  zone: DeliveryZone,
  distanceKm: number,
): { feeKobo: Kobo; pricedBy: "band" | "base_fee"; band: FeeBand | null } {
  const band = findFeeBand(zone.feeBands, distanceKm);
  if (band) {
    return { feeKobo: band.feeKobo, pricedBy: "band", band };
  }
  return { feeKobo: zone.baseFeeKobo, pricedBy: "base_fee", band: null };
}

/**
 * The active zone containing this point.
 *
 * Highest `priority` wins, because priority exists so an admin can put a
 * small special zone inside a large general one. Ties break on slug, which is
 * arbitrary but stable: the same point must never quote differently between two
 * requests, and an unordered tie would do exactly that.
 */
export function resolveZone(
  zones: readonly DeliveryZone[],
  point: Point,
): DeliveryZone | undefined {
  const containing = zones.filter(
    (zone) => zone.isActive && isPointInBoundary(zone.boundary, point),
  );

  return containing.sort(
    (a, b) => b.priority - a.priority || a.slug.localeCompare(b.slug),
  )[0];
}

/**
 * Price a delivery for a location. Nothing is stored: this answers the public
 * `/api/v1/public/quote` endpoint, which must be free of side effects so a
 * customer dragging a pin around the map cannot write thousands of rows.
 *
 * A point in no zone returns `no_zone` rather than a number. Whether that is
 * refused or quoted as a custom price is a per-zone decision the specification
 * leaves open, so this function declines to invent one.
 */
export function quoteDelivery(input: {
  readonly zones: readonly DeliveryZone[];
  readonly point: Point;
  readonly distanceKm: number;
}): DeliveryQuote {
  assertDistance(input.distanceKm);

  const zone = resolveZone(input.zones, input.point);
  if (!zone) return { ok: false, reason: "no_zone" };

  const { feeKobo, pricedBy, band } = resolveDeliveryFee(zone, input.distanceKm);

  return {
    ok: true,
    zoneSlug: zone.slug,
    zoneName: zone.name,
    feeKobo,
    paymentRequirement: zone.paymentRequirement,
    pricedBy,
    band,
  };
}
