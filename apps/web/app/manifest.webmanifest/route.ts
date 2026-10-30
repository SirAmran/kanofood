import { customerManifest } from "@/lib/manifests";

/**
 * `GET /manifest.webmanifest` — the customer app's install manifest.
 *
 * A route handler rather than `app/manifest.ts` so that `/kitchen` can state a
 * different one; see `lib/manifests.ts` for the whole argument.
 *
 * `application/manifest+json` is the registered type. `Response.json` would send
 * `application/json`, which browsers accept today and which is not what the spec
 * says, so the header is stated.
 */
export function GET(): Response {
  return new Response(JSON.stringify(customerManifest()), {
    headers: {
      "content-type": "application/manifest+json",
      // Not immutable: the names come from environment configuration, and a
      // rebrand has to reach a browser that cached yesterday's manifest.
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
