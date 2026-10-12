import { z } from "zod";

import { emailField, optionalText, passwordField, phoneField, requiredText } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { createRider } from "@/lib/admin/network";

/**
 * `POST /api/v1/admin/riders` — add a rider.
 *
 * A rider is a login plus a profile, created together. The password is set here
 * because there is no email sending until Phase 9; the operator hands it over
 * and the rider changes it. It is never returned, never logged, never audited.
 *
 * The new rider starts off shift. Going on shift is the rider's own act from
 * their own interface, and an account that looks like it is working before its
 * owner has ever signed in would be assigned deliveries they never accepted.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: requiredText("Rider name", 120),
  phone: phoneField(),
  email: emailField("Email address").optional(),
  vehicle: optionalText(80),
  password: passwordField(),
});

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor }) => {
    const id = await createRider({
      name: body.name,
      phone: body.phone,
      email: body.email ?? null,
      vehicle: body.vehicle ?? null,
      password: body.password,
      actor,
    });

    return { id };
  },
});
