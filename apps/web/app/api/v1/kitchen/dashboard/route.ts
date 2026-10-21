import { ApiError, kobo } from "@/lib/api/http";
import { kitchenRoute } from "@/lib/kitchen/route";
import { loadKitchenDashboard } from "@/lib/kitchen/dashboard";

/**
 * `GET /api/v1/kitchen/dashboard` — the numbers on screen 5.2.
 *
 * Money is stringified on the way out. The service returns BigInt, and JSON has
 * no BigInt: `NextResponse.json` would throw rather than round, but the fix
 * belongs here where the wire format is decided.
 */

export const dynamic = "force-dynamic";

export const GET = kitchenRoute({
  handler: async ({ kitchen }) => {
    const data = await loadKitchenDashboard({ kitchenId: kitchen.kitchen.id });
    if (!data) throw ApiError.notFound("That kitchen no longer exists.");

    return {
      kitchen: data.kitchen,
      counts: data.counts,
      salesTodayKobo: kobo(data.salesTodayKobo),
      queue: data.queue.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        placedAt: row.placedAt.toISOString(),
        totalKobo: kobo(row.totalKobo),
        customerName: row.customerName,
      })),
      generatedAt: data.generatedAt.toISOString(),
    };
  },
});
