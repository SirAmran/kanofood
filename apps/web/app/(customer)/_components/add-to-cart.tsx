"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@kanofood/ui";

import { useCart } from "./cart-provider";

/**
 * The add button. One kitchen per cart, so when the cart already belongs to a
 * different kitchen this asks before replacing it. A cart is a customer's
 * decisions; dropping it silently is not a decision the storefront gets to make.
 */
export function AddToCart({
  kitchenSlug,
  kitchenName,
  item,
  available = true,
  disabledReason = "Not available right now",
  quantity = 1,
  notes = null,
  label = "Add",
  block = false,
}: {
  readonly kitchenSlug: string;
  readonly kitchenName: string;
  readonly item: { readonly id: string; readonly name: string; readonly priceKobo: string };
  readonly available?: boolean;
  readonly disabledReason?: string;
  readonly quantity?: number;
  readonly notes?: string | null;
  readonly label?: string;
  readonly block?: boolean;
}) {
  const { cart, add } = useCart();
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function handleAdd() {
    if (cart && cart.kitchenSlug !== kitchenSlug) {
      const agreed = window.confirm(
        `Your cart has items from ${cart.kitchenName}. Adding ${item.name} will start a new cart and empty that one. Continue?`,
      );
      if (!agreed) return;
    }

    add({ slug: kitchenSlug, name: kitchenName }, item, quantity, notes);

    setAdded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1500);
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      block={block}
      disabled={!available}
      title={available ? undefined : disabledReason}
      onClick={handleAdd}
      aria-live="polite"
    >
      {!available ? "Unavailable" : added ? "Added" : label}
    </Button>
  );
}
