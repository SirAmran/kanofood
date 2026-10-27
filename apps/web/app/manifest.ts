import type { MetadataRoute } from "next";

/**
 * The web app manifest, generated rather than served as a static file.
 *
 * `BRAND_NAME` is configuration: the root layout and the customer shell both read
 * it, and an install that renames the platform would otherwise install an app
 * called KanoFood. A `public/manifest.webmanifest` cannot see that variable, so
 * the brand would be hardcoded in a second place and drift the first time the
 * variable changed. This route is the same read as `app/layout.tsx`, one call
 * later.
 *
 * **The icons are drawn from the brand, not committed as PNGs.** Chrome will not
 * offer "install" without a 192px and a 512px icon, and iOS will not deliver a
 * push to a site that has not been added to the home screen, so a manifest with
 * no icons made push worth nothing on an iPhone. The pair is generated at
 * `/pwa-icon/192` and `/pwa-icon/512` from `BRAND_NAME` and
 * `BRAND_COLOR_PRIMARY` (see `lib/brand-icon.tsx`), which keeps the "one place"
 * rule this file already follows: a PNG in `public/` would go on saying the old
 * name after a rebrand.
 */

/** Blank is not configured. Same rule as `app/layout.tsx`, and for the same reason. */
function configured(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export default function manifest(): MetadataRoute.Manifest {
  const brand = configured(process.env.BRAND_NAME, "KanoFood");

  return {
    id: "/",
    name: brand,
    short_name: brand,
    description: configured(process.env.BRAND_TAGLINE, "Food delivery in Kano Metropolitan."),
    lang: "en-NG",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Matches the light theme colour in the root layout's viewport export. A
    // manifest carries one colour and cannot follow `prefers-color-scheme`.
    theme_color: "#ffffff",
    background_color: "#ffffff",
    orientation: "portrait",
    // Drawn by `app/pwa-icon/[size]/route.tsx`. `maskable` on the 512 is the
    // same drawing: the letter sits inside the 80% safe circle Android crops to.
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
