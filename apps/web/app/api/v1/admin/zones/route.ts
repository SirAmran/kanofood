import { z } from "zod";

import { integerField, moneyField, optionalText, requiredText, switchField } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { createZone } from "@/lib/admin/zones";

/**
 * `POST /api/v1/admin/zones` — add a delivery zone.
 *
 * `baseFeeKobo` arrives as naira typed by a human and is parsed to kobo here,
 * because the service's input takes kobo: this column is money and the
 * conversion happens once, at the edge.
 *
 * `boundary` is not accepted. Section 11 puts the zone geometry in GeoJSON and
 * nothing in the admin interface draws or edits it yet, so a field that took an
 * arbitrary object would be a field that stores whatever it is given. A zone
 * created here gets an empty polygon, and the boundary is set when there is a
 * map to set it on. Reported with the other gaps.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: requiredText("Zone name", 120),
  slug: optionalText(120),
  baseFeeNaira: moneyField("Base fee"),
  paymentRequirement: z.enum(["cod_allowed", "prepaid_required"]),
  priority: integerField("Priority", { min: 0, max: 1000 }).optional(),
  isActive: switchField().optional(),
});

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor }) => {
    const id = await createZone({
      zone: {
        name: body.name,
        slug: body.slug ?? undefined,
        baseFeeKobo: body.baseFeeNaira,
        paymentRequirement: body.paymentRequirement,
        priority: body.priority,
        isActive: body.isActive,
      },
      actor,
    });

    return { id };
  },
});
