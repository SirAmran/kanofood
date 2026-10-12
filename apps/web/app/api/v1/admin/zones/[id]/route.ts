import { z } from "zod";

import { integerField, moneyField, requiredText, routeId, switchField } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { updateZone } from "@/lib/admin/zones";

/**
 * `PATCH /api/v1/admin/zones/:id` — edit a zone.
 *
 * The slug is not editable. Section 11 defines `DELIVERY_DEFAULT_ZONE` as the
 * slug of a zone, so the slug is what configuration points at, and changing it
 * would silently repoint or break the default without touching either file.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: requiredText("Zone name", 120).optional(),
  baseFeeNaira: moneyField("Base fee").optional(),
  paymentRequirement: z.enum(["cod_allowed", "prepaid_required"]).optional(),
  priority: integerField("Priority", { min: 0, max: 1000 }).optional(),
  isActive: switchField().optional(),
});

export const PATCH = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);

    await updateZone({
      zoneId: id,
      patch: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.baseFeeNaira !== undefined ? { baseFeeKobo: body.baseFeeNaira } : {}),
        ...(body.paymentRequirement !== undefined
          ? { paymentRequirement: body.paymentRequirement }
          : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      actor,
    });

    return { id };
  },
});
