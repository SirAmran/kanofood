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
 * **No icons, and that is a gap rather than a decision.** Chrome will not offer
 * "install" without at least a 192px and a 512px icon, and iOS will not deliver a
 * push to a site that has not been added to the home screen, so shipping a
 * manifest with a placeholder dish picture would buy an install prompt with the
 * wrong face on a customer's home screen. What is needed is a brand icon pair in
 * `public/`; until then push works in an open browser tab on Android and desktop
 * and not on an installed iOS app.
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
  };
}
