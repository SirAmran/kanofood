"use client";

import Link from "next/link";

import { useCart } from "./cart-provider";

/**
 * The cart link in the storefront header. The count is live and the badge only
 * appears once storage has been read, so the server-rendered page never shows a
 * count the browser is about to contradict.
 */
export function CartLink() {
  const { count, hydrated } = useCart();

  return (
    <Link href="/cart" className="sf-cart-link" aria-label={count > 0 ? `Cart, ${count} items` : "Cart"}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.55L21 8H6" />
        <circle cx="10" cy="20" r="1.4" />
        <circle cx="18" cy="20" r="1.4" />
      </svg>
      {hydrated && count > 0 ? <span className="sf-cart-link__count">{count}</span> : null}
    </Link>
  );
}
