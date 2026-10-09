import { haversineKm, quoteDelivery } from "@kanofood/core";
import { prisma } from "@kanofood/db";
import { z } from "zod";

import { kobo } from "@/lib/api/http";
import { publicRoute } from "@/lib/api/route";
import { loadActiveZones } from "@/lib/zones";

/**
 * `POST /api/v1/public/quote` — what delivery costs to a point.
 *
 * Public, and deliberately unauthenticated: the price of delivery is not a
 * secret, and requiring a session to find out would put a sign-up wall in front
 * of the first question every customer asks.
 *
 * POST rather than GET because the body carries coordinates, which are neither
 * cacheable nor meaningful in a URL or a server log.
 *
 * Nothing is written. A customer dragging a pin around a map can call this
 * hundreds of times and leave no rows behind.
 */

// A quote is live admin data. Caching it would serve a stale fee after an admin
// edits a band, which is exactly the kind of bug that gets blamed on the code.
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /**
   * Optional. With it, the fee is priced by distance from that kitchen, which is
   * the number a fee band is measured against. Without it there is no distance,
   * so the zone's base fee applies and the response says so.
   */
  kitchenSlug: z.string().trim().min(1).max(120).optional(),
});

/** Two decimal places, matching the `Decimal(6,2)` the bands are stored as. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export const POST = publicRoute({
  body: bodySchema,
  handler: async ({ body }) => {
    const point = { lat: body.latitude, lng: body.longitude };

    const kitchen = body.kitchenSlug
      ? await prisma.kitchen.findFirst({
          where: { slug: body.kitchenSlug, isActive: true },
          select: { lat: true, lng: true },
        })
      : null;

    // A slug that matches nothing is not an undeliverable area: the customer
    // asked about a kitchen that does not exist and should be told that, rather
    // than shown a delivery refusal for a place they never asked about.
    if (body.kitchenSlug && !kitchen) {
      return { deliverable: false as const, reason: "unknown_kitchen" as const };
    }

    const kitchenLat = kitchen?.lat ?? null;
    const kitchenLng = kitchen?.lng ?? null;
    // A kitchen with no coordinates has no distance to price against, so it
    // falls through to the base fee exactly as an omitted slug does.
    const hasDistance = kitchenLat !== null && kitchenLng !== null;
    const distanceKm = hasDistance
      ? haversineKm({ lat: kitchenLat, lng: kitchenLng }, point)
      : 0;

    const zones = await loadActiveZones({ withFeeBands: hasDistance });
    const quote = quoteDelivery({ zones, point, distanceKm });

    /**
     * An area outside every zone answers 200 with `deliverable: false`, not a
     * 4xx. "We do not deliver there yet" is a successful answer to the question
     * that was asked, and a client should render it as a state of the page
     * rather than as a transport error it has to catch.
     */
    if (!quote.ok) {
      return {
        deliverable: false as const,
        reason: "outside_delivery_area" as const,
        distanceKm: hasDistance ? round2(distanceKm) : null,
      };
    }

    return {
      deliverable: true as const,
      zone: { slug: quote.zoneSlug, name: quote.zoneName },
      feeKobo: kobo(quote.feeKobo),
      paymentRequirement: quote.paymentRequirement,
      pricedBy: quote.pricedBy,
      distanceKm: hasDistance ? round2(distanceKm) : null,
      band: quote.band ? { minKm: quote.band.minKm, maxKm: quote.band.maxKm } : null,
    };
  },
});
