import { z } from "zod";

import { integerField, optionalText, requiredText, routeId, switchField } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { deleteFeaturedCard, updateFeaturedCard } from "@/lib/admin/featured";

/**
 * `PATCH /api/v1/admin/featured/:id` — edit a card.
 * `DELETE /api/v1/admin/featured/:id` — remove it from the rail.
 *
 * The image is edited through the upload route, not here, so a hand-typed URL
 * can still be replaced by an upload without a second way to write the column.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: requiredText("Title", 80).optional(),
  subtitle: optionalText(120),
  imageUrl: optionalText(600),
  href: optionalText(300),
  badge: optionalText(30),
  sortOrder: integerField("Order", { min: 0, max: 9999 }).optional(),
  isActive: switchField().optional(),
});

export const PATCH = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);

    await updateFeaturedCard({
      id,
      patch: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.subtitle !== undefined ? { subtitle: body.subtitle } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
        ...(body.href !== undefined ? { href: body.href } : {}),
        ...(body.badge !== undefined ? { badge: body.badge } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
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
    await deleteFeaturedCard({ id, actor });
    return { id, deleted: true };
  },
});
