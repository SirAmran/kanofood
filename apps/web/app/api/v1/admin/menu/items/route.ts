import { z } from "zod";

import { integerField, nairaField, optionalText, requiredText, switchField } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { createMenuItem } from "@/lib/admin/menu";

/**
 * `POST /api/v1/admin/menu/items` — add a dish.
 *
 * The price arrives as naira typed by a human and leaves this route as kobo,
 * parsed by `moneyField` on top of `parseNairaToKobo` in core, which is integer
 * arithmetic and already tested. It never becomes a float at any point.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kitchenId: z.string().uuid("The kitchen is missing."),
  categoryId: z.string().uuid("Pick a menu section for this dish."),
  name: requiredText("Dish name", 160),
  description: optionalText(1000),
  priceNaira: nairaField("Price"),
  sortOrder: integerField("Order", { min: 0, max: 9999 }).optional(),
  isAvailable: switchField().optional(),
});

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor }) => {
    const id = await createMenuItem({
      kitchenId: body.kitchenId,
      item: {
        categoryId: body.categoryId,
        name: body.name,
        description: body.description ?? null,
        // The typed string, not kobo. The service parses it with
        // `parseNairaToKobo`, so a menu item created from anywhere is parsed
        // once, in one place, with integer arithmetic.
        priceNaira: body.priceNaira,
        sortOrder: body.sortOrder,
        isAvailable: body.isAvailable,
      },
      actor,
    });

    return { id };
  },
});
