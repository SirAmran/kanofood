import { z } from "zod";

import { kobo } from "@/lib/api/http";
import { publicRoute } from "@/lib/api/route";
import {
  BOTH_OR_NEITHER,
  bothOrNeither,
  integerField,
  pointFields,
  switchField,
  toPoint,
} from "@/lib/api/schema";
import { listPublicKitchens } from "@/lib/public/kitchens";

/**
 * `GET /api/v1/public/kitchens` — browse, search and filter. Screen 4.3.
 *
 * Public and unauthenticated. The list of kitchens is the storefront, and the
 * price of delivery is not a secret, so putting a session in front of either
 * would be a sign-up wall in front of the first question a customer asks.
 *
 * A GET, unlike `/public/quote`, because everything here is a filter: a URL that
 * can be shared, bookmarked and cached is the right shape for "the open kitchens
 * near me", and a customer who sends that link to a friend should get the same
 * page. Coordinates are query parameters rather than a body for the same reason,
 * and they are the one thing here that is about a person rather than a product.
 *
 * A location is optional. With one, every card carries the fee that kitchen
 * would charge to that point. Without one the cards carry no fee and say so,
 * rather than showing a zero that would read as free delivery.
 */

// Live admin data: a kitchen that opens, closes or edits its fee must show up on
// the next request. There is nothing here worth caching at the edge yet, and a
// stale "open" badge sends a customer to a closed kitchen.
export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    category: z.string().trim().max(80).optional(),
    /** "Open right now", for a customer who is ordering this minute. */
    open: switchField().optional(),
    sort: z.enum(["recommended", "distance", "fee", "prep", "name"]).optional(),
    limit: integerField("Limit", { min: 1, max: 100 }).optional(),
    ...pointFields,
  })
  .refine(bothOrNeither, BOTH_OR_NEITHER);

export const GET = publicRoute<unknown, z.infer<typeof querySchema>>({
  query: querySchema,
  handler: async ({ query }) => {
    const result = await listPublicKitchens({
      search: query.q,
      category: query.category,
      openNow: query.open,
      sort: query.sort,
      point: toPoint(query),
      limit: query.limit,
    });

    return {
      deliverable: result.deliverable,
      zone: result.zone,
      /**
       * Money is a decimal string on the wire, never a number. `kobo()` is the
       * one place that conversion happens, so a fee cannot arrive at a client as
       * a float in one route and a string in another.
       */
      kitchens: result.kitchens.map((kitchen) => ({
        ...kitchen,
        deliveryFeeKobo:
          kitchen.deliveryFeeKobo === null ? null : kobo(kitchen.deliveryFeeKobo),
      })),
    };
  },
});
