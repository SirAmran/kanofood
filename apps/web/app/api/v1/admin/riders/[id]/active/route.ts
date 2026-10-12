import { z } from "zod";

import { routeId, switchField } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { updateRider } from "@/lib/admin/network";

/**
 * `POST /api/v1/admin/riders/:id/active` — suspend or reinstate a rider.
 *
 * Suspending also takes them off shift and revokes their sessions, in the
 * service. A rider who is suspended and still marked available is a rider the
 * assignment picker will offer for a delivery they cannot make.
 *
 * Riders are never deleted. `deliveries.rider_id` is `onDelete: Restrict`, so a
 * rider who has left is suspended, which keeps their delivery history readable
 * and keeps "who delivered this" answerable a year later.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ isActive: switchField() });

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);
    await updateRider({ riderId: id, patch: { isActive: body.isActive }, actor });
    return { id, isActive: body.isActive };
  },
});
