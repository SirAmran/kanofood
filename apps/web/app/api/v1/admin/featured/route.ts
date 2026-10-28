import { z } from "zod";

import { integerField, optionalText, requiredText, switchField } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { createFeaturedCard } from "@/lib/admin/featured";

/**
 * `POST /api/v1/admin/featured` — add a card to the home rail.
 *
 * A card is created before it has a photograph: the row is the thing an upload
 * attaches to, and an operator on a phone can type a title and upload the image
 * in either order without a window where neither exists.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: requiredText("Title", 80),
  subtitle: optionalText(120),
  imageUrl: optionalText(600),
  href: optionalText(300),
  badge: optionalText(30),
  sortOrder: integerField("Order", { min: 0, max: 9999 }).optional(),
  isActive: switchField().optional(),
});

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor }) => {
    const id = await createFeaturedCard({
      card: {
        title: body.title,
        subtitle: body.subtitle,
        imageUrl: body.imageUrl,
        href: body.href ?? "/kitchens",
        badge: body.badge,
        sortOrder: body.sortOrder,
        isActive: body.isActive,
      },
      actor,
    });

    return { id };
  },
});
