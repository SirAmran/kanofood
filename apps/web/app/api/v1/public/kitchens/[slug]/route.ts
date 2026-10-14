import { z } from "zod";

import { ApiError, kobo } from "@/lib/api/http";
import { publicRoute } from "@/lib/api/route";
import {
  BOTH_OR_NEITHER,
  bothOrNeither,
  pointFields,
  routeSlug,
  toPoint,
} from "@/lib/api/schema";
import { getPublicKitchen } from "@/lib/public/kitchens";

/**
 * `GET /api/v1/public/kitchens/:slug` — one kitchen and its menu. Screens 4.4,
 * 4.5 and 4.6.
 *
 * One request for all three, because they are one page in three states: the
 * header, the sections, and the item sheet all draw from the same rows, and
 * splitting them would make opening a dish wait on a second round trip after the
 * menu it came from had already arrived.
 *
 * The slug is the address, not the id. It is what a shared link contains and
 * what a customer reads out, and it is stable because the admin service refuses
 * to change it: see `updateKitchenProfile`, which deliberately omits it.
 */

export const dynamic = "force-dynamic";

const querySchema = z.object(pointFields).refine(bothOrNeither, BOTH_OR_NEITHER);

export const GET = publicRoute<unknown, z.infer<typeof querySchema>>({
  query: querySchema,
  handler: async ({ query, params }) => {
    const slug = routeSlug(params);
    const view = await getPublicKitchen(slug, toPoint(query));

    /**
     * A kitchen that does not exist, or that an admin has deactivated, is a 404.
     * Deactivation is the honest signal here: the kitchen was removed from the
     * platform, so there is no page to show and a link to it should not quietly
     * resolve to a list.
     */
    if (!view) throw ApiError.notFound("That kitchen is not on KanoFood.");

    return {
      kitchen: {
        ...view.kitchen,
        deliveryFeeKobo:
          view.kitchen.deliveryFeeKobo === null ? null : kobo(view.kitchen.deliveryFeeKobo),
      },
      menu: view.menu.map((section) => ({
        ...section,
        items: section.items.map((item) => ({
          ...item,
          priceKobo: kobo(item.priceKobo),
        })),
      })),
    };
  },
});
