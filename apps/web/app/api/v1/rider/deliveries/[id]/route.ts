import { routeId } from "@/lib/api/schema";
import { ApiError } from "@/lib/api/http";
import { riderRoute } from "@/lib/rider/route";
import { loadRiderDelivery } from "@/lib/rider/deliveries";

/**
 * `GET /api/v1/rider/deliveries/:id` — one delivery in full. Screen 6.3.
 *
 * `:id` is the order id, because that is what a card links on and what the
 * admin and kitchen interfaces use. The lookup is scoped by the rider id as
 * well, so another rider's order is a 404 rather than a 403: telling them it
 * exists would let them enumerate real ids.
 */

export const dynamic = "force-dynamic";

export const GET = riderRoute({
  handler: async ({ rider, params }) => {
    const orderId = routeId(params);
    const detail = await loadRiderDelivery({ riderId: rider.rider.id, orderId });
    if (!detail) throw ApiError.notFound("That delivery is not on your list.");

    return {
      ...detail,
      subtotalKobo: detail.subtotalKobo.toString(),
      deliveryFeeKobo: detail.deliveryFeeKobo.toString(),
      totalKobo: detail.totalKobo.toString(),
      amountToCollectKobo: detail.amountToCollectKobo.toString(),
      collectedKobo: detail.collectedKobo.toString(),
      items: detail.items.map((item) => ({
        ...item,
        lineTotalKobo: item.lineTotalKobo.toString(),
      })),
    };
  },
});
