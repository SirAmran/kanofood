import { z } from "zod";

import {
  COMPLETE_COORDINATE_PAIR,
  completeCoordinatePair,
  coordinateFields,
  integerField,
  optionalText,
  phoneField,
  requiredText,
} from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { createKitchen } from "@/lib/admin/kitchens";

/**
 * `POST /api/v1/admin/kitchens` — add a kitchen.
 *
 * A kitchen is created by an operator as an operational act and never by a
 * deployment; the seed deliberately creates none. That is why this route is the
 * first thing Phase 5 needs and why section 15 puts admin before the customer
 * storefront.
 *
 * The slug is not accepted here. It is derived from the name by the service,
 * which also settles the uniqueness question against the table rather than
 * trusting a value a form supplied.
 *
 * **Coordinates are accepted, and they matter more than they look.** A kitchen
 * without a pin cannot be priced: the storefront falls back to the zone's base
 * fee and shows no distance, which silently makes every fee band in the platform
 * dead configuration. Every browse screen a customer sees quotes a fee, so a
 * kitchen that cannot be given a location is a kitchen that cannot be sold from
 * properly.
 */

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    name: requiredText("Kitchen name"),
    phone: phoneField().optional(),
    addressText: optionalText(300),
    landmark: optionalText(200),
    description: optionalText(2000),
    prepTimeMinutes: integerField("Preparation time", { min: 1, max: 600 }).optional(),
    ...coordinateFields,
  })
  .refine(completeCoordinatePair, COMPLETE_COORDINATE_PAIR);

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor }) => {
    const id = await createKitchen({
      name: body.name,
      phone: body.phone ?? null,
      addressText: body.addressText ?? null,
      landmark: body.landmark ?? null,
      description: body.description ?? null,
      prepTimeMinutes: body.prepTimeMinutes ?? null,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      actor,
    });

    return { id };
  },
});
