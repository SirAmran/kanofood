import { z } from "zod";

import { integerField, nairaField, optionalText, requiredText, switchField } from "@/lib/api/schema";
import { assertKitchenActive, kitchenRoute } from "@/lib/kitchen/route";
import { createOwnItem } from "@/lib/kitchen/menu";

/**
 * `POST /api/v1/kitchen/menu/items` — add a dish.
 *
 * The category is checked against this kitchen by the service, so a request
 * cannot attach a dish to another kitchen's section. The price is the typed
 * naira string, parsed once by the service with integer arithmetic.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  categoryId: z.string().uuid("Pick a menu section for this dish."),
  name: requiredText("Dish name", 160),
  description: optionalText(1000),
  priceNaira: nairaField("Price"),
  sortOrder: integerField("Order", { min: 0, max: 9999 }).optional(),
  isAvailable: switchField().optional(),
});

export const POST = kitchenRoute({
  body: bodySchema,
  handler: async ({ body, actor, kitchen }) => {
    assertKitchenActive(kitchen.kitchen);

    const id = await createOwnItem({
      kitchenId: kitchen.kitchen.id,
      item: {
        categoryId: body.categoryId,
        name: body.name,
        description: body.description ?? null,
        priceNaira: body.priceNaira,
        sortOrder: body.sortOrder,
        isAvailable: body.isAvailable,
      },
      actor,
    });

    return { id };
  },
});
