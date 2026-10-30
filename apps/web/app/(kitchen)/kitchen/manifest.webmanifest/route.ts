import { kitchenManifest } from "@/lib/manifests";

/**
 * `GET /kitchen/manifest.webmanifest` — the Kitchen app's install manifest.
 *
 * Its own route because Next's `manifest` file convention only works at the root
 * of `app/`, and the Kitchen app has to install under its own name, its own icon
 * and its own scope. See `lib/manifests.ts`.
 */
export function GET(): Response {
  return new Response(JSON.stringify(kitchenManifest()), {
    headers: {
      "content-type": "application/manifest+json",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
