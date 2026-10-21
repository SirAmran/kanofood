import { z } from "zod";

import { integerField, requiredText } from "@/lib/api/schema";
import { assertKitchenActive, kitchenRoute } from "@/lib/kitchen/route";
import { createOwnCategory } from "@/lib/kitchen/menu";

/**
 * `POST /api/v1/kitchen/menu/categories` — add a section to this kitchen's menu.
 *
 * No kitchen id in the body: it comes from the caller's membership, so there is
 * no field to tamper with.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: requiredText("Section name", 80),
  sortOrder: integerField("Order", { min: 0, max: 9999 }).optional(),
});

export const POST = kitchenRoute({
  body: bodySchema,
  handler: async ({ body, actor, kitchen }) => {
    assertKitchenActive(kitchen.kitchen);
    const id = await createOwnCategory({
      kitchenId: kitchen.kitchen.id,
      name: body.name,
      sortOrder: body.sortOrder,
      actor,
    });
    return { id };
  },
});
