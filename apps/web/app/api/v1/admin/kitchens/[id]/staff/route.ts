import { z } from "zod";

import { emailField, passwordField, phoneField, requiredText, routeId } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { createKitchenStaff } from "@/lib/admin/kitchens";

/**
 * `POST /api/v1/admin/kitchens/:id/staff` — add a kitchen login.
 *
 * The password is set here rather than emailed, because there is no email
 * sending until Phase 9. The operator hands it over in person and the person
 * changes it themselves. It is never returned in the response, never logged, and
 * never written to the audit row.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: requiredText("Name", 120),
  email: emailField("Email address"),
  phone: phoneField().optional(),
  password: passwordField(),
  role: z.enum(["owner", "staff"]),
});

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const kitchenId = routeId(params, "id");

    const id = await createKitchenStaff({
      kitchenId,
      name: body.name,
      email: body.email,
      phone: body.phone ?? null,
      password: body.password,
      role: body.role,
      actor,
    });

    return { id };
  },
});
