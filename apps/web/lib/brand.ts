/**
 * The platform's names and colours, read from the environment in one place.
 *
 * `BRAND_NAME` is what the platform is called, `BRAND_SHORT_NAME` is what it
 * trades as. They are two variables rather than one because the owner asked for
 * exactly that on 2026-10-28: the business is KanoFoods, the name that should
 * spread is KFDs. The header and the home-screen icon use the short one; page
 * titles, the manifest's full name and the footer use the long one.
 *
 * Absent or blank means "use the fallback", never the empty string: `.env.example`
 * ships every brand variable empty, and `??` would have let the blank win, which
 * is how every page title once rendered a dangling `|`.
 */

/** What a value has to look like before it is put into a style attribute. */
const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)$/i;

const LONG_NAME = "KanoFoods";
const SHORT_NAME = "KFDs";

function configured(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/** The legal, spoken name. Titles, the manifest's `name`, the footer. */
export function brandName(): string {
  return configured(process.env.BRAND_NAME, LONG_NAME);
}

/**
 * The wordmark. Defaults to the platform's own short name, so a deployment that
 * sets only `BRAND_NAME` still has a sensible mark, and `BRAND_SHORT_NAME`
 * exists to change it without a code change.
 */
export function shortBrandName(): string {
  return configured(process.env.BRAND_SHORT_NAME, SHORT_NAME);
}

/** One line under the name. Metadata description and the manifest. */
export function brandTagline(): string {
  return configured(process.env.BRAND_TAGLINE, "Food delivery in Kano Metropolitan.");
}

function colour(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && COLOUR.test(trimmed) ? trimmed : null;
}

/**
 * The brand colours a deployment has overridden, or nulls.
 *
 * Validated here as well as in `brand-icon.tsx` because these values land in a
 * style attribute on `<html>`: a value that is not a colour is ignored rather
 * than written out, so a typo leaves the token file's defaults in place instead
 * of breaking every surface at once.
 */
export function brandColours(): { primary: string | null; accent: string | null } {
  return {
    primary: colour(process.env.BRAND_COLOR_PRIMARY),
    accent: colour(process.env.BRAND_COLOR_ACCENT),
  };
}
