/**
 * The pieces of the remembered location that both the server and the browser
 * need: the cookie name, its lifetime, the shape, and the parser.
 *
 * Kept apart from ./location.ts because that file imports `next/headers`, and a
 * client component importing a constant from a server-only module drags the
 * whole module across the boundary and fails the build.
 */

export const LOCATION_COOKIE = "kf_location";
export const LOCATION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface SavedLocation {
  readonly label: string;
  readonly lat: number;
  readonly lng: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseLocation(raw: string | undefined): SavedLocation | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (typeof parsed !== "object" || parsed === null) return null;

    const { label, lat, lng } = parsed as Record<string, unknown>;
    if (typeof label !== "string" || !isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    return { label: label.trim().slice(0, 80) || "Your location", lat, lng };
  } catch {
    return null;
  }
}

/** The value a client writes into `document.cookie`. */
export function encodeLocation(location: SavedLocation): string {
  return encodeURIComponent(
    JSON.stringify({ label: location.label.slice(0, 80), lat: location.lat, lng: location.lng }),
  );
}
