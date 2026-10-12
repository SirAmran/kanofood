import { z } from "zod";

import { routeId, switchField } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { updateCategory } from "@/lib/admin/menu";

/**
 * `POST /api/v1/admin/menu/categories/:id/availability` — show or hide a section.
 *
 * A route of its own rather than a PATCH, because the switch writes the moment
 * it is flipped and always posts. Hiding a section hides its dishes on the
 * storefront without touching any dish's own availability, so the two switches
 * stay independent: a section switched back on returns exactly the dishes that
 * were available before it went off.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ isActive: switchField() });

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);
    await updateCategory({ categoryId: id, patch: { isActive: body.isActive }, actor });
    return { id, isActive: body.isActive };
  },
});
