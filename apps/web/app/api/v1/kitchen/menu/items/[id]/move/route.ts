import { z } from "zod";

import { routeId } from "@/lib/api/schema";
import { moveOwnItem } from "@/lib/kitchen/menu";
import { assertKitchenActive, kitchenRoute } from "@/lib/kitchen/route";

/**
 * `POST /api/v1/kitchen/menu/items/:id/move` — one place up or down.
 *
 * The whole section is renumbered, so the move has a single meaning even when
 * several dishes share a `sort_order`. The route is POST rather than PATCH on the
 * item because it is not an edit of the item's fields: it is a change to the
 * section's order that happens to name one dish.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ direction: z.enum(["up", "down"]) });

export const POST = kitchenRoute({
  body: bodySchema,
  handler: async ({ body, actor, params, kitchen }) => {
    assertKitchenActive(kitchen.kitchen);
    const id = routeId(params);

    await moveOwnItem({
      kitchenId: kitchen.kitchen.id,
      itemId: id,
      direction: body.direction,
      actor,
    });

    return { id, direction: body.direction };
  },
});
