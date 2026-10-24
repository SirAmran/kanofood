import { z } from "zod";

import { routeId } from "@/lib/api/schema";
import { moneyField } from "@/lib/api/schema";
import { ApiError } from "@/lib/api/http";
import { assertRiderActive, riderRoute } from "@/lib/rider/route";
import { loadRiderDelivery, recordRiderCash } from "@/lib/rider/deliveries";

/**
 * `POST /api/v1/rider/deliveries/:id/cash` — what the customer actually handed
 * over. Screen 6.4.
 *
 * Takes naira from the form, as kobo out. `moneyField` parses it once, in core,
 * which is where the integer arithmetic already lives and is tested.
 *
 * The expected amount is read from the order rather than sent by the client: a
 * rider's phone should not be able to tell the server what it thought it was
 * owed. A shortfall comes back in the response so the screen can say so plainly
 * before the rider puts their phone away.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  amount: moneyField("Amount collected"),
  note: z.string().trim().max(500).optional(),
});

export const POST = riderRoute({
  body: bodySchema,
  handler: async ({ body, params, rider }) => {
    assertRiderActive(rider.rider);
    const orderId = routeId(params);

    const detail = await loadRiderDelivery({ riderId: rider.rider.id, orderId });
    if (!detail) throw ApiError.notFound("That delivery is not on your list.");

    const result = await recordRiderCash({
      orderId,
      riderId: rider.rider.id,
      amountKobo: body.amount,
      expectedKobo: detail.totalKobo,
      note: body.note ?? null,
    });

    return {
      id: orderId,
      shortfallKobo: result.shortfallKobo.toString(),
      surplusKobo: result.surplusKobo.toString(),
    };
  },
});
