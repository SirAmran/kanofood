import type { MetadataRoute } from "next";

import { brandLogoUrl, brandName, brandTagline, shortBrandName } from "@/lib/brand";

/**
 * The two web app manifests, in one place.
 *
 * There are two because the platform ships as two installable apps: the customer
 * storefront at `/` and the Kitchen dashboard at `/kitchen`. They are the same
 * Next.js application and the same deployment; what differs is the name, the
 * start URL, the scope and the face, which is everything an install sheet reads.
 *
 * **Why these are routes and not `app/manifest.ts`.** A manifest is generated
 * rather than served from `public/`, because the names come from `lib/brand.ts`
 * and a static file cannot see an environment variable. But the file convention
 * lives at the root of `app/` and injects its own `<link rel="manifest">` into
 * every route, and a route group cannot shadow it: `/kitchen` would carry both
 * links and the browser would take whichever came first. Two route handlers and
 * one explicit `metadata.manifest` per layout is the arrangement where each page
 * states exactly one manifest. The URLs are unchanged — `/manifest.webmanifest`
 * and `/kitchen/manifest.webmanifest`.
 *
 * **The icons are files, and they used to be drawn.** Until 2026-10-29 the icons
 * were rendered from the first letter of `BRAND_NAME` (see the history of
 * `lib/brand-icon.tsx`). That followed a rename for free, which mattered while
 * the brand was a placeholder. The owner supplied the real artwork on 2026-10-29:
 * a rider and a serving cloche cannot be derived from a string, and the mark
 * carries no text, so a rename no longer dates it. The files are in
 * `public/brand/`, served as-is.
 *
 * `BRAND_LOGO_URL` still wins when a deployment sets it: one URL, `sizes: "any"`,
 * and the browser scales it. It overrides the customer app only, which is the
 * one the owner would rebrand first.
 *
 * Chrome will not offer "install" without a 192px and a 512px icon, and iOS will
 * not deliver a push to a site that has not been added to the home screen, so
 * both sizes are stated and the 512 is also declared `maskable`: its mark sits
 * inside the 80% circle Android crops to.
 */

/** The light theme surface. One manifest carries one colour and cannot follow the media query. */
const SURFACE = "#fdfaf6";

/** Install icons, in the sizes Chrome demands. */
function icons(prefix: string, maskable: string): NonNullable<MetadataRoute.Manifest["icons"]> {
  return [
    { src: `/brand/${prefix}-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: `/brand/${prefix}-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
    { src: `/brand/${maskable}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
}

/** The customer storefront: what a person ordering dinner installs. */
export function customerManifest(): MetadataRoute.Manifest {
  const logo = brandLogoUrl();

  return {
    id: "/",
    name: brandName(),
    // What the home screen has room for, and what people will say. The full
    // name above is what an install sheet reads out.
    short_name: shortBrandName(),
    description: brandTagline(),
    lang: "en-NG",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: SURFACE,
    background_color: SURFACE,
    orientation: "portrait",
    icons: logo
      ? [{ src: logo, sizes: "any", type: "image/png", purpose: "any" }]
      : icons("icon", "icon-maskable-512.png"),
  };
}

/**
 * The Kitchen dashboard: the app a restaurant keeps open on a tablet.
 *
 * Naming it "Kitchen" is what makes the two installs distinguishable in a
 * launcher and in the Play listing, where both carry the same developer name.
 * The scope is `/kitchen` so the installed app cannot wander into the storefront
 * and present a customer's cart to a cook — and so a link that leaves the scope
 * opens in the browser with an address bar, which is the honest outcome.
 */
export function kitchenManifest(): MetadataRoute.Manifest {
  const base = shortBrandName();

  return {
    id: "/kitchen",
    name: `${brandName()} Kitchen`,
    short_name: `${base} Kitchen`.slice(0, 12),
    description: `Order queue and menu management for ${brandName()} kitchens.`,
    lang: "en-NG",
    start_url: "/kitchen",
    scope: "/kitchen",
    display: "standalone",
    theme_color: SURFACE,
    background_color: SURFACE,
    orientation: "portrait",
    icons: icons("icon-kitchen", "icon-kitchen-maskable-512.png"),
  };
}
