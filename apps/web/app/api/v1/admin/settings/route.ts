import { z } from "zod";

import { staffRoute } from "@/lib/api/route";
import { savePlatformContact } from "@/lib/settings/platform";

/**
 * `PATCH /api/v1/admin/settings` — the platform settings an operator can change.
 *
 * One route, one table row, two fields. The values that stay in the environment
 * are deliberately not accepted here: a form that could rewrite `BRAND_NAME`
 * would change a row nothing reads until the process restarts, which looks like
 * it worked and is worse than a screen that says branding needs a deploy.
 *
 * **A cleared field is sent as `""` and stored as null, and that is the point.**
 * An operator removing a number that has gone dead falls back to whatever the
 * host configures rather than to an empty string that renders a dead call button.
 */

export const dynamic = "force-dynamic";

/**
 * A phone number that may also be cleared.
 *
 * `phoneField` in `lib/api/schema.ts` refuses an empty value because every other
 * caller requires one. This is the one place clearing is a real answer, so the
 * check is written here rather than weakening the shared field.
 */
function clearablePhone(label: string) {
  return z
    .string()
    .max(32)
    .transform((value) => value.trim())
    .refine((value) => value === "" || /^\+?[\d\s-]{7,20}$/.test(value), {
      message: `${label} does not look like a phone number.`,
    })
    .transform((value) => (value === "" ? null : value));
}

const bodySchema = z.object({
  platformPhone: clearablePhone("Platform phone").optional(),
  platformWhatsapp: clearablePhone("WhatsApp number").optional(),
});

export const PATCH = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor }) => {
    await savePlatformContact({
      patch: { phone: body.platformPhone, whatsapp: body.platformWhatsapp },
      actor,
    });

    return { saved: true };
  },
});
