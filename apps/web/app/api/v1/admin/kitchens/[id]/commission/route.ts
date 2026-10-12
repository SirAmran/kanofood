import { z } from "zod";

import { rateField, routeId } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { setCommissionRate } from "@/lib/admin/kitchens";

/**
 * `POST /api/v1/admin/kitchens/:id/commission` — set the rate.
 *
 * A rate, not an amount of money, so it is a decimal fraction and not kobo:
 * `0.1000` is ten percent. The service validates it through
 * `parseRateToBasisPoints` from core before writing, so a rate with more
 * precision than the column stores is refused rather than truncated, and the
 * basis points a settlement will be computed from are the ones that were
 * actually stored.
 *
 * An empty string clears the rate to zero, which is what a kitchen joining free
 * has. Section 1: zero at launch.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ rate: z.union([rateField(), z.literal("")]) });

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);
    const rate = body.rate === "" ? null : body.rate;
    await setCommissionRate({ kitchenId: id, rate, actor });
    return { id, rate };
  },
});
