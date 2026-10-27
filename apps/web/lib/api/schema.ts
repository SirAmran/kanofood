import { z } from "zod";

import { parseNairaToKobo } from "@kanofood/core";
import type { Kobo, PolygonGeometry } from "@kanofood/core";

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

/**
 * A number, arriving as a string from a query parameter.
 *
 * Every query value is a string, so `?lat=12.0022` reaches zod as text and
 * `z.coerce.number()` would turn the blank of `?lat=` into a real `0`, which is
 * a coordinate off the coast of Africa rather than a missing one. This refuses
 * the blank instead, exactly as `integerField` does for whole numbers.
 */
export function numberField(label: string, bounds: { min?: number; max?: number } = {}) {
  let schema = z
    .string()
    .max(32)
    .transform((value) => value.trim())
    .refine((value) => value !== "" && Number.isFinite(Number(value)), {
      message: `${label} must be a number.`,
    })
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
 * A number that may be cleared, from a form field.
 *
 * Three outcomes, and the middle one is the reason this exists. Absent means
 * "leave it alone"; an empty string means "clear it to null"; anything else must
 * parse as a number. A plain `numberField().optional()` collapses the first two
 * into `undefined`, which would make clearing a kitchen's pin impossible: the
 * form would send an empty box, the service would read "no change", and the old
 * coordinate would survive an edit that visibly removed it.
 *
 * Accepts a real number as well as a string, because a coordinate may arrive
 * from a map control rather than a text input.
 */
export function nullableNumberField(
  label: string,
  bounds: { min?: number; max?: number } = {},
) {
  return z
    .union([z.string().max(32), z.number()])
    .optional()
    .transform((value, ctx): number | null | undefined => {
      if (value === undefined) return undefined;

      const text = String(value).trim();
      if (text === "") return null;

      const parsed = Number(text);
      const outOfRange =
        !Number.isFinite(parsed) ||
        (bounds.min !== undefined && parsed < bounds.min) ||
        (bounds.max !== undefined && parsed > bounds.max);

      if (outOfRange) {
        ctx.addIssue({
          code: "custom",
          message: `${label} must be a number between ${bounds.min ?? "-"} and ${bounds.max ?? "-"}.`,
        });
        return undefined;
      }

      return parsed;
    });
}

/** Latitude and longitude for an admin form. See `nullableNumberField`. */
export const coordinateFields = {
  lat: nullableNumberField("Latitude", { min: -90, max: 90 }),
  lng: nullableNumberField("Longitude", { min: -180, max: 180 }),
} as const;

/**
 * A point on the map, from a query string.
 *
 * Latitude and longitude travel together or not at all. Half a coordinate is
 * never what a caller meant: a client that sent only `lat` would otherwise be
 * read as if it had sent no location, and the storefront would quietly fall back
 * to listing every kitchen in Kano as though the customer had not said where
 * they were. `pointFields` is spread into a route's own schema, `bothOrNeither`
 * is the refinement that enforces the pair, and `toPoint` is the read.
 */
export const pointFields = {
  lat: numberField("Latitude", { min: -90, max: 90 }).optional(),
  lng: numberField("Longitude", { min: -180, max: 180 }).optional(),
} as const;

export function bothOrNeither(value: { lat?: unknown; lng?: unknown }): boolean {
  return (value.lat === undefined) === (value.lng === undefined);
}

/**
 * The same rule for a form, where "clear it" exists.
 *
 * A query string can only say "here is a number" or say nothing, so
 * `bothOrNeither` is the whole rule there. A form can also send an empty box,
 * which means "this kitchen has no pin". That makes three permitted states
 * rather than two: neither field sent, both sent as a number, or both cleared.
 * Anything else, including one cleared while the other carries a value, is half
 * a coordinate and is refused.
 *
 * This is the check that stops a kitchen ending up at a latitude with no
 * longitude, which is not a location anywhere and which the fee logic would
 * quietly treat as "no pin" for the rest of the platform's life.
 */
export function completeCoordinatePair(value: {
  lat?: number | null;
  lng?: number | null;
}): boolean {
  if (value.lat === undefined && value.lng === undefined) return true;
  if (value.lat === undefined || value.lng === undefined) return false;
  return (value.lat === null) === (value.lng === null);
}

/** The message that goes with `completeCoordinatePair`. */
export const COMPLETE_COORDINATE_PAIR = {
  message: "Give both a latitude and a longitude, or clear both.",
  path: ["lat"],
};

/** The message that goes with `bothOrNeither`, so four routes phrase it once. */
export const BOTH_OR_NEITHER = {
  message: "Send both a latitude and a longitude, or neither.",
  path: ["lat"],
};

export function toPoint(value: { lat?: number; lng?: number }): {
  lat: number;
  lng: number;
} | null {
  if (value.lat === undefined || value.lng === undefined) return null;
  return { lat: value.lat, lng: value.lng };
}

// ---------------------------------------------------------------------------
// Zone boundaries
// ---------------------------------------------------------------------------

/**
 * The boundary a zone has before anybody draws one.
 *
 * A polygon with no rings has no area, and `isPointInBoundary` answers `false`
 * for every point in it, which is the truthful answer: the zone matches nothing
 * yet. It is not the same as a corrupt boundary and must not be read as one.
 */
export const EMPTY_POLYGON = { type: "Polygon", coordinates: [] } as const;

/** The most vertices a hand-drawn outline can have. */
const MAX_VERTICES = 2000;

/** Six decimal places: what a pin is stored at, and about 11 cm of ground. */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

type PolygonRead =
  | { readonly ok: true; readonly polygon: PolygonGeometry }
  | { readonly ok: false; readonly message: string };

/**
 * Read a zone outline out of whatever the form sent.
 *
 * Three shapes arrive in practice: nothing at all, an empty string (the last
 * vertex was removed), and a GeoJSON object. Anything else is a 400 that names
 * the problem, because a boundary is the thing that decides what a customer is
 * charged and a shape stored without being understood is a fee nobody can
 * explain later.
 */
function readPolygon(value: unknown, label: string): PolygonRead {
  if (typeof value !== "object" || value === null) {
    return { ok: false, message: `${label} must be a polygon.` };
  }

  const shape = value as { type?: unknown; coordinates?: unknown };

  if (shape.type !== "Polygon") {
    // `MultiPolygon` is refused rather than stored: the admin screen draws one
    // outline, so a multi-part shape would be one it could save and then not
    // show, which is the same as having no editor.
    return {
      ok: false,
      message: `${label} must be a single polygon.`,
    };
  }

  if (!Array.isArray(shape.coordinates)) {
    return { ok: false, message: `${label} has no coordinates.` };
  }
  if (shape.coordinates.length > 1) {
    return { ok: false, message: `${label} cannot have holes yet. Draw one outline.` };
  }

  const ring: unknown = shape.coordinates[0] ?? [];
  if (!Array.isArray(ring)) {
    return { ok: false, message: `${label} has no outline.` };
  }
  if (ring.length === 0) return { ok: true, polygon: EMPTY_POLYGON };
  if (ring.length > MAX_VERTICES) {
    return { ok: false, message: `${label} has too many points to store.` };
  }

  const positions: [number, number][] = [];
  for (const position of ring) {
    if (!Array.isArray(position) || position.length !== 2) {
      return {
        ok: false,
        message: `${label} points must each be a longitude and a latitude.`,
      };
    }

    const lng: unknown = position[0];
    const lat: unknown = position[1];

    if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return { ok: false, message: `${label} has a longitude outside -180 to 180.` };
    }
    if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      return { ok: false, message: `${label} has a latitude outside -90 to 90.` };
    }

    positions.push([round6(lng), round6(lat)]);
  }

  // GeoJSON closes a ring by repeating the first position last, and every reader
  // expects it. The editor sends the vertices it drew, so closing is done here
  // rather than asking each future writer to remember.
  const first = positions[0]!;
  const last = positions[positions.length - 1]!;
  const closed =
    first[0] === last[0] && first[1] === last[1] ? positions : [...positions, first];

  const distinct = new Set(
    closed.slice(0, -1).map(([lng, lat]) => `${String(lng)},${String(lat)}`),
  );
  if (distinct.size < 3) {
    return { ok: false, message: `${label} needs three different points to enclose an area.` };
  }

  return { ok: true, polygon: { type: "Polygon", coordinates: [closed] } };
}

/**
 * A delivery zone's boundary, from an admin form.
 *
 * Absent means "leave it alone"; `null`, an empty string or an empty polygon
 * means "clear it". The admin form holds every field as a string, so the shape
 * arrives as JSON text; parsing it here keeps one validator for the shape rather
 * than one in the form and another in the route.
 *
 * Self-intersection is not checked. A bow-tie outline is a shape an operator can
 * see on the map they just drew it on, and the point-in-polygon test answers
 * something definite for it either way.
 */
export function boundaryField(label = "The zone boundary") {
  return z.unknown().transform((value, ctx): PolygonGeometry => {
    if (value === undefined || value === null) return EMPTY_POLYGON;

    let candidate: unknown = value;
    if (typeof candidate === "string") {
      if (candidate.trim() === "") return EMPTY_POLYGON;
      try {
        candidate = JSON.parse(candidate);
      } catch {
        ctx.addIssue({ code: "custom", message: `${label} is not readable.` });
        return z.NEVER;
      }
    }

    const read = readPolygon(candidate, label);
    if (!read.ok) {
      ctx.addIssue({ code: "custom", message: read.message });
      return z.NEVER;
    }

    return read.polygon;
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

/**
 * A slug from the address.
 *
 * Unlike `routeId`, this is a customer-visible name rather than an internal key,
 * so its shape is checked here and a malformed one is refused before it costs a
 * database round trip. The admin service generates a slug from the kitchen's
 * name; this is the reader's half of that contract.
 */
export function routeSlug(params: Record<string, string | string[]>, key = "slug"): string {
  const value = params[key];
  if (typeof value !== "string" || value === "") {
    throw ApiError.badRequest("The address is missing the kitchen.");
  }
  if (!/^[a-z0-9][a-z0-9-]{0,118}[a-z0-9]$/.test(value)) {
    throw ApiError.badRequest("That is not a kitchen address.");
  }
  return value;
}
