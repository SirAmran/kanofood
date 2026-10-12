import { z } from "zod";

import { optionalText, routeId } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { markCashHandedOver } from "@/lib/admin/cash";

/**
 * `POST /api/v1/admin/cash/collections/:id/handover` — the rider says they are
 * handing the money over.
 *
 * Normally the rider's own interface posts this. It is here as well because an
 * operator recording a handover that was phoned in is a real thing on a bad day,
 * and the alternative is that they edit the database by hand.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ notes: optionalText(500) });

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);
    await markCashHandedOver({ collectionId: id, notes: body.notes ?? null, actor });
    return { id, status: "handed_over" };
  },
});
