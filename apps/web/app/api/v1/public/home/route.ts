import { z } from "zod";

import { kobo } from "@/lib/api/http";
import { publicRoute } from "@/lib/api/route";
import {
  BOTH_OR_NEITHER,
  bothOrNeither,
  pointFields,
  toPoint,
} from "@/lib/api/schema";
import { getPublicHome } from "@/lib/public/kitchens";

/**
 * `GET /api/v1/public/home` — everything screen 4.1 draws, in one request.
 *
 * The rails are composed on the server rather than assembled by the client from
 * three calls, for one reason: they have to agree. "Nearby kitchens", "popular
 * items" and the delivery strip all depend on which zone the customer is in, and
 * a client that fetched them separately would let the rails disagree during the
 * window between the first response and the last. One request cannot.
 *
 * The whole home screen is one round trip on a slow connection, which is the
 * connection this is being built for.
 */

export const dynamic = "force-dynamic";

const querySchema = z.object(pointFields).refine(bothOrNeither, BOTH_OR_NEITHER);

export const GET = publicRoute<unknown, z.infer<typeof querySchema>>({
  query: querySchema,
  handler: async ({ query }) => {
    const view = await getPublicHome(toPoint(query));

    return {
      deliverable: view.deliverable,
      zone: view.zone,
      categories: view.categories,
      kitchens: view.kitchens.map((kitchen) => ({
        ...kitchen,
        deliveryFeeKobo:
          kitchen.deliveryFeeKobo === null ? null : kobo(kitchen.deliveryFeeKobo),
      })),
      popular: view.popular.map((item) => ({
        ...item,
        priceKobo: kobo(item.priceKobo),
      })),
    };
  },
});
