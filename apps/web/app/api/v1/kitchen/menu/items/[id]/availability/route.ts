import { z } from "zod";

import { routeId, switchField } from "@/lib/api/schema";
import { assertKitchenActive, kitchenRoute } from "@/lib/kitchen/route";
import { setOwnItemAvailable } from "@/lib/kitchen/menu";

/**
 * `POST /api/v1/kitchen/menu/items/:id/availability` — sold out, or back on.
 *
 * Its own route because it is the one menu edit made mid-service, it is switched
 * the moment it is flipped, and it wants its own audit action rather than
 * reading as a rename or a repricing.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ isAvailable: switchField() });

export const POST = kitchenRoute({
  body: bodySchema,
  handler: async ({ body, actor, params, kitchen }) => {
    assertKitchenActive(kitchen.kitchen);
    const id = routeId(params);

    await setOwnItemAvailable({
      kitchenId: kitchen.kitchen.id,
      itemId: id,
      isAvailable: body.isAvailable,
      actor,
    });

    return { id, isAvailable: body.isAvailable };
  },
});
