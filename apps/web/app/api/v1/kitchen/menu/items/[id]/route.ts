import { z } from "zod";

import { ApiError, kobo } from "@/lib/api/http";
import { integerField, nairaField, optionalText, requiredText, routeId, switchField } from "@/lib/api/schema";
import { assertKitchenActive, kitchenRoute } from "@/lib/kitchen/route";
import { deleteOwnItem, loadKitchenMenuItem, updateOwnItem } from "@/lib/kitchen/menu";

/**
 * `GET /api/v1/kitchen/menu/items/:id` — one dish, for the editor.
 * `PATCH /api/v1/kitchen/menu/items/:id` — edit it.
 * `DELETE /api/v1/kitchen/menu/items/:id` — take it off the menu.
 *
 * The delete is safe because `order_items.menu_item_id` is `onDelete: SetNull`
 * and every line keeps its own name and price snapshot, so past orders still
 * read back exactly as they were placed.
 */

export const dynamic = "force-dynamic";

export const GET = kitchenRoute({
  handler: async ({ params, kitchen }) => {
    const id = routeId(params);
    const item = await loadKitchenMenuItem({ kitchenId: kitchen.kitchen.id, itemId: id });
    if (!item) throw ApiError.notFound("That dish is not on this kitchen's menu.");

    return { ...item, priceKobo: kobo(item.priceKobo) };
  },
});

const bodySchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: requiredText("Dish name", 160).optional(),
  description: optionalText(1000),
  priceNaira: nairaField("Price").optional(),
  sortOrder: integerField("Order", { min: 0, max: 9999 }).optional(),
  isAvailable: switchField().optional(),
});

export const PATCH = kitchenRoute({
  body: bodySchema,
  handler: async ({ body, actor, params, kitchen }) => {
    assertKitchenActive(kitchen.kitchen);
    const id = routeId(params);

    await updateOwnItem({
      kitchenId: kitchen.kitchen.id,
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

export const DELETE = kitchenRoute({
  handler: async ({ actor, params, kitchen }) => {
    assertKitchenActive(kitchen.kitchen);
    const id = routeId(params);
    await deleteOwnItem({ kitchenId: kitchen.kitchen.id, itemId: id, actor });
    return { id, deleted: true };
  },
});
