import { riderRoute } from "@/lib/rider/route";
import { listRiderDeliveries } from "@/lib/rider/deliveries";

/**
 * `GET /api/v1/rider/deliveries` — today's deliveries. Screen 6.2.
 *
 * Every row is scoped by the rider id resolved from the caller's own rider row.
 * There is no parameter that could widen that: the only thing the caller can
 * influence is nothing at all.
 */

export const dynamic = "force-dynamic";

export const GET = riderRoute({
  handler: async ({ rider }) => {
    const list = await listRiderDeliveries({ riderId: rider.rider.id });
    return {
      ...list,
      rows: list.rows.map((row) => ({
        ...row,
        amountToCollectKobo: row.amountToCollectKobo.toString(),
      })),
      cashHeldKobo: list.cashHeldKobo.toString(),
    };
  },
});
