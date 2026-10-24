import { routeId } from "@/lib/api/schema";
import { riderRoute } from "@/lib/rider/route";
import { acknowledgeRiderDelivery } from "@/lib/rider/deliveries";

/**
 * `POST /api/v1/rider/deliveries/:id/acknowledge` — clear a cancelled delivery
 * off the rider's list.
 *
 * Only for a cancellation the platform made. A failed delivery is refused here
 * on purpose: it stays on the rider's screen until an admin has resolved it, so
 * closing it from the rider side cannot empty the admin's failure queue.
 */

export const dynamic = "force-dynamic";

export const POST = riderRoute({
  handler: async ({ params, rider }) => {
    const orderId = routeId(params);
    await acknowledgeRiderDelivery({ orderId, riderId: rider.rider.id });
    return { id: orderId, acknowledged: true };
  },
});
