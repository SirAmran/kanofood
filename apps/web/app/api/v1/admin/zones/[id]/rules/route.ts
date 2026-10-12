import { z } from "zod";

import { moneyField, requiredText, routeId } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { createFeeRule } from "@/lib/admin/zones";

/**
 * `POST /api/v1/admin/zones/:id/rules` — add a distance tier.
 *
 * The distances are strings rather than numbers because the column is
 * `Decimal(6,2)` and the service does the rounding: sending a float from the
 * browser and rounding it again in the service is how a tier ends up stored at
 * 2.9999999 and matching nothing.
 *
 * The service refuses a tier that overlaps a sibling. Edges that touch are fine:
 * 0 to 3 and 3 to 5 tile.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  minKm: requiredText("Lower distance", 12),
  maxKm: requiredText("Upper distance", 12),
  feeNaira: moneyField("Fee"),
});

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const zoneId = routeId(params, "id");

    const id = await createFeeRule({
      zoneId,
      minKm: body.minKm,
      maxKm: body.maxKm,
      feeKobo: body.feeNaira,
      actor,
    });

    return { id };
  },
});
