import { z } from "zod";

import { integerField, requiredText } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { createCategory } from "@/lib/admin/menu";

/**
 * `POST /api/v1/admin/menu/categories` — add a menu section.
 *
 * The kitchen is in the body rather than the path because the screen that
 * creates a category is the kitchen detail page, which already knows which
 * kitchen it is on, and a route that repeats a fact twice is a route where the
 * two copies can disagree.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kitchenId: z.string().uuid("The kitchen is missing."),
  name: requiredText("Category name", 120),
  sortOrder: integerField("Order", { min: 0, max: 9999 }).optional(),
});

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor }) => {
    const id = await createCategory({
      kitchenId: body.kitchenId,
      name: body.name,
      sortOrder: body.sortOrder,
      actor,
    });

    return { id };
  },
});
