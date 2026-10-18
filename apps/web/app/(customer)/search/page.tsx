import type { Metadata } from "next";

import { readSavedLocation } from "@/lib/public/location";

import { SearchView } from "../_components/search-view";

/**
 * Search. Screen 4.2. The shell is a server component so the saved point is
 * available for fees and distances; the typing and fetching happen in the
 * client view.
 */
export const metadata: Metadata = { title: "Search" };

export default async function SearchPage() {
  const location = await readSavedLocation();
  const point = location ? { lat: location.lat, lng: location.lng } : null;

  return <SearchView point={point} />;
}
