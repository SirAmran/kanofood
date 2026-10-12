import { routeId } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { deleteSettlement } from "@/lib/admin/settlements";

/**
 * `DELETE /api/v1/admin/settlements/:id` — remove a settlement nobody has paid.
 *
 * A pending settlement is a statement nobody has acted on, and the usual reason
 * to remove one is that the period was wrong. A paid one cannot be removed: the
 * money left the account, and the correction is a conversation and a
 * compensating entry, not a deleted row. The service refuses it.
 */

export const dynamic = "force-dynamic";

export const DELETE = staffRoute({
  roles: ["admin"],
  handler: async ({ actor, params }) => {
    const id = routeId(params);
    await deleteSettlement({ settlementId: id, actor });
    return { id, deleted: true };
  },
});
