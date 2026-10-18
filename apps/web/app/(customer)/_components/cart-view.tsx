"use client";

import Link from "next/link";

import { formatNaira } from "@kanofood/core";
import { Button, buttonClass, EmptyState } from "@kanofood/ui";

import { useCart } from "./cart-provider";

/**
 * The cart. Screen 4.7 is the next slice; this is the readable cart the browse
 * screens need so "view cart" is never a dead end.
 *
 * Checkout is deliberately absent and the button says so. The order API exists,
 * but the screen that collects a name, phone and address does not yet, and a
 * button that looks live and does nothing is worse than one marked as coming.
 */
export function CartView() {
  const { cart, hydrated, subtotalKobo, setQuantity, remove, clear } = useCart();

  if (!hydrated) {
    return <div className="sf-loading" aria-hidden="true" />;
  }

  if (!cart) {
    return (
      <EmptyState
        title="Your cart is empty"
        action={
          <Link href="/kitchens" className={buttonClass({ variant: "primary", size: "sm" })}>
            Browse kitchens
          </Link>
        }
      >
        Add a dish from any kitchen and it will wait here, even after a refresh.
      </EmptyState>
    );
  }

  return (
    <section className="sf-cart">
      <div className="sf-hero">
        <h1 className="sf-hero__title">Your cart</h1>
        <p className="sf-tile__meta">
          From{" "}
          <Link href={`/kitchens/${cart.kitchenSlug}`} className="kf-link">
            {cart.kitchenName}
          </Link>
        </p>
      </div>

      <div>
        {cart.lines.map((line) => {
          const lineTotal = BigInt(line.priceKobo) * BigInt(line.quantity);

          return (
            <div key={line.menuItemId} className="sf-cart-line">
              <div className="sf-cart-line__body">
                <span className="sf-cart-line__name">{line.name}</span>
                {line.notes ? <span className="sf-cart-line__note">{line.notes}</span> : null}
                <span className="sf-cart-line__actions">
                  <span className="sf-qty">
                    <button
                      type="button"
                      className="sf-qty__btn"
                      onClick={() => setQuantity(line.menuItemId, line.quantity - 1)}
                      aria-label={`One fewer ${line.name}`}
                    >
                      −
                    </button>
                    <span className="sf-qty__value">{line.quantity}</span>
                    <button
                      type="button"
                      className="sf-qty__btn"
                      onClick={() => setQuantity(line.menuItemId, line.quantity + 1)}
                      disabled={line.quantity >= 50}
                      aria-label={`One more ${line.name}`}
                    >
                      +
                    </button>
                  </span>
                  <button
                    type="button"
                    className="sf-cart-remove"
                    onClick={() => remove(line.menuItemId)}
                  >
                    Remove
                  </button>
                </span>
              </div>
              <span className="sf-cart-line__price">{formatNaira(lineTotal)}</span>
            </div>
          );
        })}
      </div>

      <div className="sf-cart-summary">
        <div className="sf-cart-total">
          <span>Subtotal</span>
          <span>{formatNaira(subtotalKobo)}</span>
        </div>
        <p className="sf-cart-note">
          Delivery is calculated at checkout from your saved location.
        </p>
        <Button type="button" variant="primary" block disabled>
          Checkout coming next
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (window.confirm("Empty this cart?")) clear();
          }}
        >
          Empty cart
        </Button>
      </div>
    </section>
  );
}
