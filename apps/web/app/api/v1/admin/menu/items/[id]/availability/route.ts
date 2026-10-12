import { z } from "zod";

import { routeId, switchField } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { setMenuItemAvailable } from "@/lib/admin/menu";

/**
 * `POST /api/v1/admin/menu/items/:id/availability` — mark a dish in or out.
 *
 * The switch a kitchen flips when the tilapia runs out. Its own route and its
 * own audit action, because it is the single most-used control on the menu and
 * "who marked the jollof unavailable" should be one query, not a diff of two
 * snapshots of the whole item.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ isAvailable: switchField() });

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);
    await setMenuItemAvailable({ itemId: id, isAvailable: body.isAvailable, actor });
    return { id, isAvailable: body.isAvailable };
  },
});
