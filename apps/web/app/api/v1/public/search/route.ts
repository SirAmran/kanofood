import { z } from "zod";

import { kobo } from "@/lib/api/http";
import { publicRoute } from "@/lib/api/route";
import { BOTH_OR_NEITHER, bothOrNeither, pointFields, toPoint } from "@/lib/api/schema";
import { searchPublic } from "@/lib/public/kitchens";

/**
 * `GET /api/v1/public/search` — one query across kitchens and dishes. Screen 4.2.
 *
 * Separate from `/public/kitchens` because its answer has two labelled groups,
 * and folding dishes into the browse response would make every browse caller
 * carry a field it never reads. Public and unauthenticated, like the rest of the
 * storefront.
 *
 * The screen calls this on a short debounce while the customer types, which is
 * the "instant local filter, then remote results" of UX_SPEC 4.2. Nothing is
 * written, like every other browse path.
 */

export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    q: z.string().trim().min(1, "Type something to search for.").max(80),
    ...pointFields,
  })
  .refine(bothOrNeither, BOTH_OR_NEITHER);

export const GET = publicRoute<unknown, z.infer<typeof querySchema>>({
  query: querySchema,
  handler: async ({ query }) => {
    const result = await searchPublic(query.q, toPoint(query));

    return {
      kitchens: result.kitchens.map((kitchen) => ({
        ...kitchen,
        deliveryFeeKobo: kitchen.deliveryFeeKobo === null ? null : kobo(kitchen.deliveryFeeKobo),
      })),
      dishes: result.dishes.map((dish) => ({
        ...dish,
        priceKobo: kobo(dish.priceKobo),
      })),
    };
  },
});
