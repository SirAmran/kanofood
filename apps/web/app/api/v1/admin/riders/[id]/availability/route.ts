import { z } from "zod";

import { routeId, switchField } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { updateRider } from "@/lib/admin/network";

/**
 * `POST /api/v1/admin/riders/:id/availability` — put a rider on or off shift.
 *
 * Normally the rider does this to themselves, and this route exists for the
 * other case: somebody phones in, or a rider forgets to go off shift at the end
 * of the day and the assignment picker keeps offering them. The service refuses
 * to put a suspended rider on shift, so this cannot be used to work around a
 * suspension.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ isAvailable: switchField() });

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);
    await updateRider({ riderId: id, patch: { isAvailable: body.isAvailable }, actor });
    return { id, isAvailable: body.isAvailable };
  },
});
