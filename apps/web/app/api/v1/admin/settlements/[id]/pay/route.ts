import { z } from "zod";

import { requiredText, routeId } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { paySettlement } from "@/lib/admin/settlements";

/**
 * `POST /api/v1/admin/settlements/:id/pay` — record that the transfer was made.
 *
 * A reference is required and is not a formality: it is the only thing tying
 * this row to the bank transfer, and a paid settlement with no reference cannot
 * be reconciled against a statement later. The service refuses an empty one.
 *
 * Nothing here moves money. It records that a person moved it.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reference: requiredText("Payment reference", 120) });

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);
    await paySettlement({ settlementId: id, reference: body.reference, actor });
    return { id, status: "paid" };
  },
});
