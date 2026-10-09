import { type DeliveryZone, type FeeBand, parseAreaGeometry } from "@kanofood/core";
import { prisma } from "@kanofood/db";

import { ApiError } from "./api/http";

/**
 * Prisma rows to the shapes `packages/core` prices from.
 *
 * The translation lives here rather than in core so core keeps its zero
 * dependencies, and rather than in each route so the `Decimal` and `Json`
 * conversions happen in exactly one place. Three conversions are needed and each
 * has a wrong answer that would look plausible:
 *
 * - `boundary` is `Json` in the database and must be re-parsed, not cast. A
 *   cast would ship an unvalidated object into the point-in-polygon test.
 * - `minKm` / `maxKm` are `Decimal` and arrive as objects, not numbers. Without
 *   `.toNumber()` every distance comparison silently compares an object.
 * - `feeKobo` is `BigInt` and stays one. It is never a `Number`, because kobo
 *   values are exact and floats are not.
 */

function toFeeBand(rule: {
  minKm: { toNumber(): number };
  maxKm: { toNumber(): number };
  feeKobo: bigint;
}): FeeBand {
  return {
    minKm: rule.minKm.toNumber(),
    maxKm: rule.maxKm.toNumber(),
    feeKobo: rule.feeKobo,
  };
}

/**
 * Load the active zones in the shape core expects.
 *
 * `withFeeBands` is a parameter rather than always-on because the bands are only
 * meaningful when a distance exists. Quoting without one relies on core's
 * documented base-fee fallback, and loading bands there would leave them unused.
 */
export async function loadActiveZones(options: {
  readonly withFeeBands: boolean;
}): Promise<DeliveryZone[]> {
  const rows = await prisma.deliveryZone.findMany({
    where: { isActive: true },
    include: { feeRules: { orderBy: { minKm: "asc" } } },
  });

  return rows.map((row) => {
    let boundary;
    try {
      boundary = parseAreaGeometry(row.boundary);
    } catch (cause) {
      // A boundary that fails to parse is an admin data fault, and it is named
      // in the log so whoever reads it knows which zone to fix. The customer
      // gets the generic message: the fault is not theirs and a slug is not
      // something they can act on. Swallowing this instead would turn the
      // storefront into "we do not deliver to you" with nothing to go on.
      console.error(`[zones] zone ${row.slug} has an unreadable boundary`, cause);
      throw ApiError.internal();
    }

    return {
      slug: row.slug,
      name: row.name,
      boundary,
      baseFeeKobo: row.baseFeeKobo,
      paymentRequirement: row.paymentRequirement,
      isActive: row.isActive,
      priority: row.priority,
      feeBands: options.withFeeBands ? row.feeRules.map(toFeeBand) : [],
    };
  });
}
