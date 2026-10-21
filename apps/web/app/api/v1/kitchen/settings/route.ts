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
import { ApiError } from "@/lib/api/http";
import { kitchenRoute, assertKitchenActive } from "@/lib/kitchen/route";
import { loadKitchenSettings, updateOwnKitchenProfile } from "@/lib/kitchen/settings";

/**
 * `GET /api/v1/kitchen/settings` — this kitchen's profile and status.
 * `PATCH /api/v1/kitchen/settings` — edit it.
 *
 * There is no kitchen id in the address, and that is the security model: the
 * kitchen is the caller's membership, resolved from the session. A route with an
 * id in it would need an ownership check on every handler, and one forgotten
 * check is one kitchen editing another.
 *
 * The slug and the commission rate are not editable here, because both are the
 * platform's decisions rather than the kitchen's.
 */

export const dynamic = "force-dynamic";

export const GET = kitchenRoute({
  handler: async ({ kitchen }) => {
    const settings = await loadKitchenSettings(kitchen.kitchen.id);
    if (!settings) throw ApiError.notFound("That kitchen no longer exists.");
    return settings;
  },
});

const bodySchema = z
  .object({
    name: requiredText("Kitchen name").optional(),
    phone: phoneField().optional(),
    addressText: optionalText(300),
    landmark: optionalText(200),
    description: optionalText(2000),
    prepTimeMinutes: integerField("Preparation time", { min: 1, max: 600 }).optional(),
    ...coordinateFields,
  })
  .refine(completeCoordinatePair, COMPLETE_COORDINATE_PAIR);

export const PATCH = kitchenRoute({
  body: bodySchema,
  handler: async ({ body, actor, kitchen }) => {
    assertKitchenActive(kitchen.kitchen);

    await updateOwnKitchenProfile({
      kitchenId: kitchen.kitchen.id,
      patch: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.addressText !== undefined ? { addressText: body.addressText } : {}),
        ...(body.landmark !== undefined ? { landmark: body.landmark } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.prepTimeMinutes !== undefined ? { prepTimeMinutes: body.prepTimeMinutes } : {}),
        // `null` means "clear the pin", so the undefined test decides, not truthiness.
        ...(body.lat !== undefined ? { lat: body.lat } : {}),
        ...(body.lng !== undefined ? { lng: body.lng } : {}),
      },
      actor,
    });

    return { id: kitchen.kitchen.id };
  },
});
