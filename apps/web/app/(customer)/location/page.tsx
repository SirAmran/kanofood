import type { Metadata } from "next";

import { readSavedLocation } from "@/lib/public/location";
import { loadPlatformContact } from "@/lib/settings/platform";

import { LocationView } from "../_components/location-view";

/**
 * Screen 4.8. The `next` parameter is how the checkout link comes to this screen
 * and goes back to it, and it is restricted to a same-site path: redirecting to
 * whatever a query string says is an open redirect, and the two characters that
 * distinguish `//evil.example` from a path are easy to miss.
 */

export const metadata: Metadata = { title: "Delivery location" };

export default async function LocationPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const initialPoint = await readSavedLocation();
  const target = typeof next === "string" && /^\/(?!\/)/.test(next) ? next : "/";
  const contact = await loadPlatformContact();

  return <LocationView initialPoint={initialPoint} next={target} platformPhone={contact.phone} />;
}
