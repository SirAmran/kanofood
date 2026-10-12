import { z } from "zod";

import { optionalText, phoneField, requiredText, routeId } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { updateRider } from "@/lib/admin/network";

/**
 * `PATCH /api/v1/admin/riders/:id` — edit a rider.
 *
 * The name and phone are written to `users` and `riders` together by the
 * service, because both tables carry them: the `users` row is what a sign-in
 * matches and the `riders` row is what every delivery screen reads, so a change
 * to one and not the other is a rider whose name differs depending on who is
 * looking.
 *
 * Only what was sent is written.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: requiredText("Rider name", 120).optional(),
  phone: phoneField().optional(),
  vehicle: optionalText(80),
});

export const PATCH = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);

    await updateRider({
      riderId: id,
      patch: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.vehicle !== undefined ? { vehicle: body.vehicle } : {}),
      },
      actor,
    });

    return { id };
  },
});
