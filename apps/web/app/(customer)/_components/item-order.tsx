"use client";

import { useState } from "react";

import { formatNaira } from "@kanofood/core";

import { AddToCart } from "./add-to-cart";

/**
 * Quantity, note and add. Screen 4.6.
 *
 * The note is capped at 300 characters because that is what the cart and the
 * order API accept; the box refuses more rather than letting the API trim it
 * after the customer has left the screen.
 */
export function ItemOrder({
  kitchenSlug,
  kitchenName,
  item,
  available,
  disabledReason,
}: {
  readonly kitchenSlug: string;
  readonly kitchenName: string;
  readonly item: { readonly id: string; readonly name: string; readonly priceKobo: string };
  readonly available: boolean;
  readonly disabledReason?: string;
}) {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  const total = BigInt(item.priceKobo) * BigInt(quantity);

  return (
    <div className="sf-order-form">
      <div className="sf-qty">
        <button
          type="button"
          className="sf-qty__btn"
          onClick={() => setQuantity((current) => Math.max(1, current - 1))}
          disabled={quantity <= 1}
          aria-label="One fewer"
        >
          −
        </button>
        <span className="sf-qty__value" aria-live="polite">
          {quantity}
        </span>
        <button
          type="button"
          className="sf-qty__btn"
          onClick={() => setQuantity((current) => Math.min(50, current + 1))}
          disabled={quantity >= 50}
          aria-label="One more"
        >
          +
        </button>
      </div>

      <label className="kf-field">
        <span className="kf-label">Anything the kitchen should know?</span>
        <textarea
          className="kf-textarea"
          value={notes}
          onChange={(event) => setNotes(event.target.value.slice(0, 300))}
          placeholder="Extra pepper, no onions…"
          rows={2}
          maxLength={300}
        />
        <span className="kf-hint">{notes.length} of 300 characters</span>
      </label>

      <AddToCart
        kitchenSlug={kitchenSlug}
        kitchenName={kitchenName}
        item={item}
        available={available}
        disabledReason={disabledReason}
        quantity={quantity}
        notes={notes.trim() === "" ? null : notes}
        label={`Add to cart · ${formatNaira(total)}`}
        block
      />
    </div>
  );
}
