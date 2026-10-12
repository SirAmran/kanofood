import { z } from "zod";

import { moneyField, requiredText, routeId } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { deleteFeeRule, updateFeeRule } from "@/lib/admin/zones";

/**
 * `PATCH /api/v1/admin/fee-rules/:id` — change a tier.
 * `DELETE /api/v1/admin/fee-rules/:id` — remove one.
 *
 * Tiered under its own path rather than under the zone, because a tier knows its
 * own zone and a URL that carries both is a URL where the two can disagree. The
 * service looks the zone up from the row.
 *
 * Deleting the last tier in a zone is refused. A zone with no tiers cannot price
 * a delivery, and it would look configured while being unable to quote.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  minKm: requiredText("Lower distance", 12),
  maxKm: requiredText("Upper distance", 12),
  feeNaira: moneyField("Fee"),
});

export const PATCH = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);

    await updateFeeRule({
      ruleId: id,
      minKm: body.minKm,
      maxKm: body.maxKm,
      feeKobo: body.feeNaira,
      actor,
    });

    return { id };
  },
});

export const DELETE = staffRoute({
  roles: ["admin"],
  handler: async ({ actor, params }) => {
    const id = routeId(params);
    await deleteFeeRule({ ruleId: id, actor });
    return { id, deleted: true };
  },
});
