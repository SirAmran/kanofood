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

/**
 * A URL a deployment has pointed at the real logo, or null.
 *
 * Empty is the normal case: the KFDs artwork is committed under `public/brand/`,
 * so a deployment that changes nothing gets the real mark. This exists for the
 * case the file set cannot serve — a franchise running its own artwork without a
 * fork — and it is read in `lib/manifests.ts`, where the install icon is stated.
 *
 * Not validated as strictly as a colour: a URL lands in a manifest rather than a
 * style attribute, and the worst a bad one does is leave a broken icon that the
 * committed set would have got right. A value with no scheme is treated as a
 * path on this site, which is what somebody typing `/brand/x.png` means.
 */
export function brandLogoUrl(): string | null {
  const trimmed = process.env.BRAND_LOGO_URL?.trim();
  return trimmed ? trimmed : null;
}

/**
 * A URL a deployment has pointed at its own favicon, or null.
 *
 * `null` is the normal case and means "use the committed `app/favicon.ico` and
 * `app/icon.png`", because Next's file conventions already put the right `<link>`
 * tags in the head. Setting it adds an explicit `icons` entry, which is only
 * useful when the file conventions are not the right answer.
 */
export function brandFaviconUrl(): string | null {
  const trimmed = process.env.BRAND_FAVICON_URL?.trim();
  return trimmed ? trimmed : null;
}

function colour(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && COLOUR.test(trimmed) ? trimmed : null;
}

/**
 * The brand colours a deployment has overridden, or nulls.
 *
 * Validated here because these values land in a style attribute on `<html>`: a
 * value that is not a colour is ignored rather than written out, so a typo leaves
 * the token file's defaults in place instead of breaking every surface at once.
 */
export function brandColours(): { primary: string | null; accent: string | null } {
  return {
    primary: colour(process.env.BRAND_COLOR_PRIMARY),
    accent: colour(process.env.BRAND_COLOR_ACCENT),
  };
}
