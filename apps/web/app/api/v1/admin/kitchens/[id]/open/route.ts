import { z } from "zod";

import { routeId, switchField } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { setKitchenOpen } from "@/lib/admin/kitchens";

/**
 * `POST /api/v1/admin/kitchens/:id/open` — open or close for trading.
 *
 * Its own route rather than a field on the profile form, because it is the
 * switch that decides whether customers can order at all, it is flipped far more
 * often than anything on the profile, and it wants its own audit action so "who
 * closed the kitchen at 8pm" is one query.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ isOpen: switchField() });

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);
    await setKitchenOpen({ kitchenId: id, isOpen: body.isOpen, actor });
    return { id, isOpen: body.isOpen };
  },
});
