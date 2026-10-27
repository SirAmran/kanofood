import { ImageResponse } from "next/og";

/**
 * The installable app's mark, drawn rather than committed as a PNG.
 *
 * Phase 10. Chrome will not offer "install" without a 192px and a 512px icon,
 * and iOS will not deliver a push to a site that has not been added to the home
 * screen, so the manifest shipped without icons and push was worth nothing on an
 * iPhone. What was missing was not an image file: it was a mark, and the brand is
 * still undecided.
 *
 * **A letter, not a logo.** The monogram is the first letter of `BRAND_NAME`, so
 * a rebrand changes the icon with the rest of the platform instead of leaving a
 * face on a customer's home screen that belongs to a name nobody uses any more.
 * That is also why this is a route rather than two files in `public/`: a PNG in
 * `public/` cannot see an environment variable. When there is a real logo,
 * `BRAND_LOGO_URL` is the thing to draw instead, and this file is where it goes.
 *
 * The letter sits at 56% of the canvas, well inside the 80% circle a maskable
 * icon is cropped to, so the same drawing serves both purposes.
 */

/** The colour a brand override has to look like before it is used as a fill. */
const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)$/i;

/** The fallback, matching `--brand-primary` in `packages/ui/src/tokens.css`. */
const FALLBACK_COLOUR = "#10693f";

/** The first letter of the platform's name, upper-cased. */
export function brandLetter(): string {
  const name = process.env.BRAND_NAME?.trim() || "KanoFood";
  const first = [...name].find((character) => /[\p{L}\p{N}]/u.test(character));
  return (first ?? "K").toUpperCase();
}

/**
 * The background fill.
 *
 * A value that is not a colour is ignored rather than passed to the renderer,
 * because an unparseable fill is a blank icon on somebody's home screen rather
 * than a build failure anybody notices.
 */
export function brandColour(): string {
  const configured = process.env.BRAND_COLOR_PRIMARY?.trim();
  return configured && COLOUR.test(configured) ? configured : FALLBACK_COLOUR;
}

/** The mark itself, at a given square size. */
export function brandMark(pixels: number): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: brandColour(),
          color: "#ffffff",
          fontSize: Math.round(pixels * 0.56),
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {brandLetter()}
      </div>
    ),
    {
      width: pixels,
      height: pixels,
      headers: {
        // The mark changes only when the deployment's brand does, so an hour is
        // enough to keep a rebrand from looking broken and enough to stop every
        // install re-rendering it. Not `immutable`: a rebrand does change it.
        "cache-control": "public, max-age=3600",
      },
    },
  );
}
