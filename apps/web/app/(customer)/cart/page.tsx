import type { Metadata } from "next";

import { CartView } from "../_components/cart-view";

/**
 * Cart. The full screen 4.7 arrives with the order flow; this one exists so the
 * header link and every "added" state land somewhere real.
 */
export const metadata: Metadata = { title: "Cart" };

export default function CartPage() {
  return <CartView />;
}
