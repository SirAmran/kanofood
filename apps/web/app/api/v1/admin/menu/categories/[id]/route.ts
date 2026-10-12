import { z } from "zod";

import { integerField, requiredText, routeId } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { updateCategory } from "@/lib/admin/menu";

/**
 * `PATCH /api/v1/admin/menu/categories/:id` — rename or reorder a section.
 *
 * There is no DELETE. `menu_categories` cascades to `menu_items`, so deleting a
 * category would delete every dish in it, and no screen should be one confirmed
 * click away from that. A section that is no longer wanted is switched off.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: requiredText("Category name", 120).optional(),
  sortOrder: integerField("Order", { min: 0, max: 9999 }).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);
    await updateCategory({ categoryId: id, patch: body, actor });
    return { id };
  },
});
