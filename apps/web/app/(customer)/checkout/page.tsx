import type { Metadata } from "next";

import { loadPlatformContact } from "@/lib/settings/platform";

import { CheckoutView } from "../_components/checkout-view";

/** Screen 4.9. The address and cart are read in the browser, so this shell is thin. */

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const contact = await loadPlatformContact();

  return <CheckoutView platformPhone={contact.phone} />;
}
