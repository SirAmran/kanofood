import { z } from "zod";

import { parseNairaToKobo } from "@kanofood/core";
import type { Kobo } from "@kanofood/core";

import { ApiError } from "./http";

/**
 * The field schemas the admin forms post.
 *
 * Twenty route files share about six field shapes, and the versions of them that
 * get written out twenty times are the versions that drift: one trims, another
 * does not; one turns an empty string into null, another stores the empty string
 * and the database ends up with two spellings of "nothing". So they live here.
 *
 * **Empty means absent, and only sometimes empty means null.** A form with an
 * optional text field that the operator has cleared sends `""`, and what that
 * should become depends on the column: a nullable text column wants `null`, a
 * field that is required wants a validation failure. `optionalText` and
 * `requiredText` are those two answers and nothing else is on offer.
 */

/** Text that may be cleared. `""` becomes `null`, whitespace is trimmed. */
export function optionalText(max = 500) {
  return z
    .string()
    .max(max, `Keep it under ${max} characters.`)
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    });
}

/** Text that must be present. `""` fails, and the message names the field. */
export function requiredText(label: string, max = 200) {
  return z
    .string()
    .max(max, `${label} must be under ${max} characters.`)
    .transform((value) => value.trim())
    .refine((value) => value !== "", { message: `${label} is required.` });
}

/**
 * An email address, from a text field.
 *
 * Deliberately loose. There is no regular expression that validates an email
 * address and the ones that try reject real addresses; the only authority on
 * whether it works is whether mail arrives. What is checked here is that it
 * looks like one, so an obvious typo is caught at the form rather than at the
 * first sign-in attempt.
 */
export function emailField(label = "Email address") {
  return z
    .string()
    .max(320)
    .transform((value) => value.trim().toLowerCase())
    .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
      message: `${label} does not look like an email address.`,
    });
}

/** A phone number. Nigeria, so digits, spaces, and an optional leading plus. */
export function phoneField(label = "Phone number") {
  return z
    .string()
    .max(32)
    .transform((value) => value.trim())
    .refine((value) => /^\+?[\d\s-]{7,20}$/.test(value), {
      message: `${label} does not look like a phone number.`,
    });
}

/** A password, with the floor the services also enforce. */
export function passwordField(minimum = 12) {
  return z
    .string()
    .min(minimum, `A password must be at least ${minimum} characters.`)
    .max(200);
}

/**
 * A whole number, arriving as a string from an `<input type="number">`.
 *
 * `z.coerce.number()` would turn `""` into `0`, which is the classic way a blank
 * field becomes a real zero. This refuses it instead.
 */
export function integerField(label: string, bounds: { min?: number; max?: number } = {}) {
  let schema = z
    .string()
    .transform((value) => value.trim())
    .refine((value) => /^-?\d+$/.test(value), { message: `${label} must be a whole number.` })
    .transform((value) => Number(value));

  if (bounds.min !== undefined) {
    schema = schema.refine((value) => value >= bounds.min!, {
      message: `${label} cannot be below ${bounds.min}.`,
    });
  }
  if (bounds.max !== undefined) {
    schema = schema.refine((value) => value <= bounds.max!, {
      message: `${label} cannot be above ${bounds.max}.`,
    });
  }

  return schema;
}

/**
 * Money, typed in naira, arriving as kobo.
 *
 * Parse failures are converted to a 400 naming the field rather than escaping as
 * an unhandled `TypeError`, which is what `parseNairaToKobo` throws on its own.
 * The conversion itself stays in core, where it is integer arithmetic and
 * already tested.
 *
 * **Use `nairaField` instead wherever the service takes the typed string.** A
 * service that parses its own money wants naira; handing it kobo digits makes it
 * parse them as naira again, which prices everything at one hundredth.
 */
export function moneyField(label: string) {
  return z
    .string()
    .max(32)
    .transform((value) => value.trim())
    .refine((value) => value !== "", { message: `${label} is required.` })
    .transform((value, ctx): Kobo => {
      try {
        const kobo = parseNairaToKobo(value);
        if (kobo < 0n) {
          ctx.addIssue({ code: "custom", message: `${label} cannot be negative.` });
          return 0n;
        }
        return kobo;
      } catch {
        ctx.addIssue({ code: "custom", message: `${label} is not an amount of money.` });
        return 0n;
      }
    });
}

/**
 * Money, typed in naira, still a string on the way out.
 *
 * Validated here and parsed by the service. Both spellings exist because both
 * ends are real: a route that writes a kobo column parses once itself, and a
 * route whose service takes the human's typed amount must not parse it twice.
 */
export function nairaField(label: string) {
  return z
    .string()
    .max(32)
    .transform((value) => value.trim())
    .refine((value) => value !== "", { message: `${label} is required.` })
    .refine((value) => /^\d+(\.\d{1,2})?$/.test(value.replace(/[\s,₦]/g, "")), {
      message: `${label} must be an amount such as 2500 or 2500.50.`,
    });
}

/** A rate such as `0.1000`, kept as a string so nothing rounds it on the way in. */
export function rateField(label = "Commission rate") {
  return z
    .string()
    .max(16)
    .transform((value) => value.trim())
    .refine((value) => /^\d+(\.\d{1,4})?$/.test(value), {
      message: `${label} must be a decimal fraction such as 0.1000 for 10%.`,
    })
    .refine((value) => Number(value) <= 1, { message: `${label} cannot be above 1.` });
}

/** A `YYYY-MM-DD` date from a date input. */
export function dateField(label: string) {
  return z
    .string()
    .transform((value) => value.trim())
    .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), {
      message: `${label} must be a date.`,
    });
}

/** A switch. Accepts a real boolean or the strings a form might send. */
export function switchField() {
  return z.union([z.boolean(), z.enum(["true", "false", "on", "off"])]).transform((value) => {
    if (typeof value === "boolean") return value;
    return value === "true" || value === "on";
  });
}

/** The route parameter, refused with a 400 rather than reaching Prisma as `undefined`. */
export function routeId(params: Record<string, string | string[]>, key = "id"): string {
  const value = params[key];
  if (typeof value !== "string" || value === "") {
    throw ApiError.badRequest("The id is missing from the address.");
  }
  return value;
}
