import { z } from "zod";

import { routeId, switchField } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { setKitchenStaffActive } from "@/lib/admin/kitchens";

/**
 * `POST /api/v1/admin/kitchen-staff/:id/active` — suspend or reinstate a login.
 *
 * `:id` is the `kitchen_users` row, not the `users` row. One person may work at
 * two kitchens, and the link is what is being switched: suspending somebody at
 * one kitchen must not sign them out of the other.
 *
 * Suspending revokes every open session for that user, in the same transaction.
 * A deactivation that leaves a working refresh token is a deactivation that
 * lasts until the token expires, which is thirty days.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ isActive: switchField() });

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);
    await setKitchenStaffActive({ staffLinkId: id, isActive: body.isActive, actor });
    return { id, isActive: body.isActive };
  },
});
