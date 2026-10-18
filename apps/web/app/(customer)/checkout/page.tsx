import type { Metadata } from "next";

import { platformPhone } from "@/lib/env";

import { CheckoutView } from "../_components/checkout-view";

/** Screen 4.9. The address and cart are read in the browser, so this shell is thin. */

export const metadata: Metadata = { title: "Checkout" };

export default function CheckoutPage() {
  return <CheckoutView platformPhone={platformPhone()} />;
}
