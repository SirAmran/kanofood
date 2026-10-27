import { z } from "zod";

import {
  boundaryField,
  integerField,
  moneyField,
  optionalText,
  requiredText,
  switchField,
} from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { createZone } from "@/lib/admin/zones";

/**
 * `POST /api/v1/admin/zones` — add a delivery zone.
 *
 * `baseFeeKobo` arrives as naira typed by a human and is parsed to kobo here,
 * because the service's input takes kobo: this column is money and the
 * conversion happens once, at the edge.
 *
 * `boundary` is the outline drawn on screen 7.7. It arrives as the GeoJSON the
 * editor produced (see `boundaryField`), and a zone added without one is stored
 * with an empty polygon, which matches no address until somebody draws it.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: requiredText("Zone name", 120),
  slug: optionalText(120),
  boundary: boundaryField().optional(),
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
        boundary: body.boundary,
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
