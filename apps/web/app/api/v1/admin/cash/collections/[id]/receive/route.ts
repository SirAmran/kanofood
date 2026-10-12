import { z } from "zod";

import { optionalText, routeId } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { receiveCash } from "@/lib/admin/cash";

/**
 * `POST /api/v1/admin/cash/collections/:id/receive` — the money has been counted
 * and is with the platform.
 *
 * The count is not recorded, only the fact of it. `cash_collections` has one
 * amount column and it was written when the rider collected; if a handover comes
 * up short, the honest record is a note saying so, not a second amount that
 * quietly disagrees with the first. A discrepancy is a thing to see.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ notes: optionalText(500) });

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);
    await receiveCash({ collectionId: id, notes: body.notes ?? null, actor });
    return { id, status: "received" };
  },
});
