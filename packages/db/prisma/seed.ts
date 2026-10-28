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
 * The standard delivery fee, in kobo, and the zone's base fee.
 *
 * PRODUCT_SPEC section 1 stated ₦1,000. The owner set ₦1,500 on 2026-10-28, so
 * that is what this is now; the specification line is superseded rather than
 * quietly contradicted. It is written here and lives in the database as a row —
 * nothing in application code may hold this number.
 *
 * The base fee is not decorative. It is what a point pays when it matches no
 * band: a kitchen with no pin, or an address beyond the last band. That path is
 * why a real test order on 2026-10-28 was charged ₦1,000 while every band said
 * ₦1,500, so raising this is the half of the change that fixes the checkout.
 */
const STANDARD_DELIVERY_FEE_KOBO = 150_000n;

/**
 * Distance bands, and what each costs.
 *
 * PRODUCT_SPEC section 11 sketches 0-3km, 3-5km, 5-8km as X, Y, Z without naming
 * prices. The owner set the near price on 2026-10-28: **₦1,500 within 2 km of the
 * kitchen**, which is why the first edge moved from 3 km to 2 km rather than
 * being left as the sketch had it. The 2-5 km band carries the same ₦1,500 for
 * now, and 5-8 km carries ₦2,000; both are existing live values kept so this
 * change does not silently reprice a customer who is 4 km away. An admin can
 * edit either from the zones screen without a deploy.
 */
const NEAR_BAND_FEE_KOBO = STANDARD_DELIVERY_FEE_KOBO;
const FAR_BAND_FEE_KOBO = 200_000n; // ₦2,000, 5-8 km

const FEE_BANDS: ReadonlyArray<{ minKm: number; maxKm: number; feeKobo: bigint }> = [
  { minKm: 0, maxKm: 2, feeKobo: NEAR_BAND_FEE_KOBO },
  { minKm: 2, maxKm: 5, feeKobo: NEAR_BAND_FEE_KOBO },
  { minKm: 5, maxKm: 8, feeKobo: FAR_BAND_FEE_KOBO },
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
        feeKobo: band.feeKobo,
      })),
    });
    return tx.deliveryFeeRule.count({ where: { zoneId: zone.id } });
  });

  console.log(`zone      ${zone.slug} (${zone.id})`);
  console.log(
    `fee rules ${feeRules} tiers: ` +
      FEE_BANDS.map((band) => `${band.minKm}-${band.maxKm}km ${band.feeKobo}`).join(", "),
  );

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
