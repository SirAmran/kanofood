import { z } from "zod";

import { integerField, requiredText, routeId, switchField } from "@/lib/api/schema";
import { assertKitchenActive, kitchenRoute } from "@/lib/kitchen/route";
import { updateOwnCategory } from "@/lib/kitchen/menu";

/**
 * `PATCH /api/v1/kitchen/menu/categories/:id` — rename, reorder or hide a section.
 *
 * The service checks the section belongs to this kitchen before writing, and
 * answers not found when it does not. Hiding a section is independent of the
 * dishes inside it, so switching it back on restores exactly what was there.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: requiredText("Section name", 80).optional(),
  sortOrder: integerField("Order", { min: 0, max: 9999 }).optional(),
  isActive: switchField().optional(),
});

export const PATCH = kitchenRoute({
  body: bodySchema,
  handler: async ({ body, actor, params, kitchen }) => {
    assertKitchenActive(kitchen.kitchen);
    const id = routeId(params);

    await updateOwnCategory({
      kitchenId: kitchen.kitchen.id,
      categoryId: id,
      patch: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      actor,
    });

    return { id };
  },
});
