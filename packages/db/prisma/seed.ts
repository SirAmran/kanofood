/**
 * Seed. docs/ARCHITECTURE.md section 5, Phase 2.
 *
 * This seeds configuration, not content. The only thing the application cannot
 * start without is the default delivery zone: rates for every zone are rows,
 * never constants, so with no zone there is no way to quote a delivery and the
 * storefront has nothing to open with.
 *
 * Deliberately NOT seeded:
 *
 *   - Any user. Creating an admin needs a password hash, and password hashing
 *     belongs to the auth phase. Seeding a user without credentials would ship
 *     an account nobody can sign in to and pretend the job was done.
 *   - Any kitchen or menu. Kitchens are added by an admin as an operational act,
 *     not by a deploy, and the menu is real business content. Sample content
 *     would be invented data sitting in the database, and it would be wrong the
 *     first time anyone changed a price.
 *
 * Idempotent: safe to run repeatedly. The zone is upserted on its slug. The fee
 * tiers are replaced wholesale on each run, because they have no natural key and
 * a partially-updated tier set is worse than a reset one. Nothing outside the
 * default zone is touched.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma 7 has no implicit connection: the client is handed a driver adapter.
 * Unlike the application singleton this one is not cached, because a seed is a
 * single short-lived process.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Run the seed through npm so ../../.env is loaded.",
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/**
 * The standard in-zone delivery fee, in kobo. PRODUCT_SPEC section 1 states it
 * as naira; this file is the one place it is written down, and it exists in the
 * database as a row. Nothing in application code may hold this number.
 */
const STANDARD_DELIVERY_FEE_KOBO = 100_000n;

/**
 * Distance bands from PRODUCT_SPEC section 11: 0-3km, 3-5km, 5-8km. All three
 * carry the standard fee for now. Section 11 writes the tier prices as X, Y and
 * Z without naming them, so inventing a premium here would be inventing pricing.
 * The rows exist at the standard rate and an admin sets a premium when there is
 * one to set.
 */
const FEE_BANDS: ReadonlyArray<{ minKm: number; maxKm: number }> = [
  { minKm: 0, maxKm: 3 },
  { minKm: 3, maxKm: 5 },
  { minKm: 5, maxKm: 8 },
];

/**
 * A bounding box around Kano Metropolitan, as GeoJSON.
 *
 * THIS IS A PLACEHOLDER AND MUST BE REPLACED WITH THE REAL BOUNDARY BEFORE
 * LAUNCH. It is a rectangle, not the operating area, and delivering against it
 * would price some addresses as in-zone that are not and the reverse. It is
 * seeded anyway because the alternative is a database the application cannot
 * quote against at all, and a visible placeholder is easier to find than an
 * empty table. The `_placeholder` key is there so it can be detected in a query
 * rather than remembered.
 */
const PLACEHOLDER_BOUNDARY = {
  _placeholder: true,
  _note: "Bounding box standing in for the real Kano Metropolitan boundary. Replace before launch.",
  type: "Polygon",
  coordinates: [
    [
      [8.4, 11.85],
      [8.7, 11.85],
      [8.7, 12.15],
      [8.4, 12.15],
      [8.4, 11.85],
    ],
  ],
} as const;

async function main(): Promise<void> {
  const slug = process.env.DELIVERY_DEFAULT_ZONE?.trim() || "kano-metropolitan";

  const zone = await prisma.deliveryZone.upsert({
    where: { slug },
    update: {
      name: "Kano Metropolitan",
      baseFeeKobo: STANDARD_DELIVERY_FEE_KOBO,
      paymentRequirement: "cod_allowed",
      isActive: true,
      priority: 0,
    },
    create: {
      slug,
      name: "Kano Metropolitan",
      boundary: PLACEHOLDER_BOUNDARY,
      baseFeeKobo: STANDARD_DELIVERY_FEE_KOBO,
      paymentRequirement: "cod_allowed",
      isActive: true,
      priority: 0,
    },
  });

  // The boundary is only written on create. A re-run must never overwrite a
  // real boundary that an admin has since drawn in.
  const feeRules = await prisma.$transaction(async (tx) => {
    await tx.deliveryFeeRule.deleteMany({ where: { zoneId: zone.id } });
    await tx.deliveryFeeRule.createMany({
      data: FEE_BANDS.map((band) => ({
        zoneId: zone.id,
        minKm: band.minKm,
        maxKm: band.maxKm,
        feeKobo: STANDARD_DELIVERY_FEE_KOBO,
      })),
    });
    return tx.deliveryFeeRule.count({ where: { zoneId: zone.id } });
  });

  console.log(`zone      ${zone.slug} (${zone.id})`);
  console.log(`fee rules ${feeRules} tiers, all at ${STANDARD_DELIVERY_FEE_KOBO} kobo`);

  if (zone.boundary && (zone.boundary as { _placeholder?: boolean })._placeholder) {
    console.warn("boundary  PLACEHOLDER rectangle. Replace with the real zone boundary before launch.");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
