import { z } from "zod";

import {
  COMPLETE_COORDINATE_PAIR,
  completeCoordinatePair,
  coordinateFields,
  integerField,
  optionalText,
  phoneField,
  requiredText,
  routeId,
} from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { updateKitchenProfile } from "@/lib/admin/kitchens";

/**
 * `PATCH /api/v1/admin/kitchens/:id` — the profile.
 *
 * Every field is optional and only what was sent is written, so a form that
 * edits the phone number cannot blank the description by leaving it out. The
 * slug is not here: it is what shared links and configuration point at, and
 * changing it silently breaks both.
 *
 * Coordinates are the one pair that must move together, because half a
 * coordinate is not a location. Sending both empty clears the pin, which is the
 * only way to say "this kitchen's position is unknown" and have it stick.
 */

export const dynamic = "force-dynamic";

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

export const PATCH = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);

    await updateKitchenProfile({
      kitchenId: id,
      patch: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.addressText !== undefined ? { addressText: body.addressText } : {}),
        ...(body.landmark !== undefined ? { landmark: body.landmark } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.prepTimeMinutes !== undefined ? { prepTimeMinutes: body.prepTimeMinutes } : {}),
        // `null` is a real instruction here, meaning "clear it", so the
        // undefined test is what decides, not a truthiness check.
        ...(body.lat !== undefined ? { lat: body.lat } : {}),
        ...(body.lng !== undefined ? { lng: body.lng } : {}),
      },
      actor,
    });

    return { id };
  },
});
