import { cookies } from "next/headers";

import { LOCATION_COOKIE, parseLocation, type SavedLocation } from "./location-shared";

/**
 * The customer's delivery point, remembered between visits.
 *
 * There are no customer accounts, so the location lives in a cookie: readable by
 * the server on the first paint, which is what lets a card carry a real delivery
 * fee instead of resolving every price after hydration. The cart lives in
 * localStorage because it is only ever read by the client; the location is read
 * by both, so a cookie is the right container.
 *
 * A malformed cookie is treated as no location rather than as an error. The
 * screen then asks for one, which is what it would do on a first visit.
 */

export { LOCATION_COOKIE, LOCATION_MAX_AGE_SECONDS, parseLocation } from "./location-shared";
export type { SavedLocation } from "./location-shared";

export async function readSavedLocation(): Promise<SavedLocation | null> {
  const store = await cookies();
  return parseLocation(store.get(LOCATION_COOKIE)?.value);
}
