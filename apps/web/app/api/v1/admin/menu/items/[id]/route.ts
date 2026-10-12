import { z } from "zod";

import { integerField, nairaField, optionalText, requiredText, routeId, switchField } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { deleteMenuItem, updateMenuItem } from "@/lib/admin/menu";

/**
 * `PATCH /api/v1/admin/menu/items/:id` — edit a dish.
 * `DELETE /api/v1/admin/menu/items/:id` — remove one.
 *
 * Available is editable here as well as through `/availability`, because the
 * edit form has it and a form that silently drops a field it displays is a form
 * that loses the operator's change without telling them.
 *
 * The delete is the only true delete in the admin interface. It is safe:
 * `order_items.menu_item_id` is `onDelete: SetNull` and the line keeps its own
 * name and price snapshots, so an order placed last week still reads back
 * exactly as it was placed. The stored image is removed from the bucket after
 * the row is gone, never before.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: requiredText("Dish name", 160).optional(),
  description: optionalText(1000),
  priceNaira: nairaField("Price").optional(),
  sortOrder: integerField("Order", { min: 0, max: 9999 }).optional(),
  isAvailable: switchField().optional(),
});

export const PATCH = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);

    await updateMenuItem({
      itemId: id,
      patch: {
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.priceNaira !== undefined ? { priceNaira: body.priceNaira } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.isAvailable !== undefined ? { isAvailable: body.isAvailable } : {}),
      },
      actor,
    });

    return { id };
  },
});

export const DELETE = staffRoute({
  roles: ["admin"],
  handler: async ({ actor, params }) => {
    const id = routeId(params);
    await deleteMenuItem({ itemId: id, actor });
    return { id, deleted: true };
  },
});
