import { ApiError, kobo } from "@/lib/api/http";
import { routeId } from "@/lib/api/schema";
import { kitchenRoute } from "@/lib/kitchen/route";
import { loadKitchenOrder } from "@/lib/kitchen/orders";

/**
 * `GET /api/v1/kitchen/orders/:id` — one order, scoped to this kitchen.
 *
 * An order belonging to another kitchen answers as not found rather than as
 * forbidden, so the response cannot be used to tell a real id from a fake one.
 */

export const dynamic = "force-dynamic";

export const GET = kitchenRoute({
  handler: async ({ params, kitchen }) => {
    const id = routeId(params);
    const order = await loadKitchenOrder({ kitchenId: kitchen.kitchen.id, orderId: id });
    if (!order) throw ApiError.notFound("That order is not on this kitchen's board.");

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      placedAt: order.placedAt.toISOString(),
      subtotalKobo: kobo(order.subtotalKobo),
      deliveryFeeKobo: kobo(order.deliveryFeeKobo),
      totalKobo: kobo(order.totalKobo),
      paymentMethod: order.paymentMethod,
      deliveryNotes: order.deliveryNotes,
      customer: order.customer,
      address: order.address,
      items: order.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPriceKobo: kobo(item.unitPriceKobo),
        lineTotalKobo: kobo(item.lineTotalKobo),
        notes: item.notes,
      })),
      events: order.events.map((event) => ({
        id: event.id,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        actorName: event.actorName,
        actorRole: event.actorRole,
        reason: event.reason,
        createdAt: event.createdAt.toISOString(),
      })),
      riderName: order.riderName,
      actions: order.actions,
    };
  },
});
