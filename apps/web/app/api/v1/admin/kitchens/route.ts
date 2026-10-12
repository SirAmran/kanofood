import { z } from "zod";

import { optionalText, integerField, phoneField, requiredText } from "@/lib/api/schema";
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
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: requiredText("Kitchen name"),
  phone: phoneField().optional(),
  addressText: optionalText(300),
  landmark: optionalText(200),
  description: optionalText(2000),
  prepTimeMinutes: integerField("Preparation time", { min: 1, max: 600 }).optional(),
});

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
      actor,
    });

    return { id };
  },
});
