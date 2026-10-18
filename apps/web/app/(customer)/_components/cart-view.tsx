"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { formatNaira } from "@kanofood/core";
import { Alert, Button, buttonClass, EmptyState, Spinner } from "@kanofood/ui";

import { readLocationCookie } from "@/lib/public/location-shared";

import { useCart } from "./cart-provider";
import { fetchAvailability, fetchQuote, type DeliveryQuote, type KitchenAvailability } from "./storefront-api";

/**
 * Screen 4.7, the cart.
 *
 * Everything on it is live rather than remembered: the fee comes from a quote for
 * this point and this kitchen, and the menu status comes from the kitchen now, so
 * a dish that sold out while the cart sat in storage is marked before checkout
 * rather than refused after it.
 *
 * Continue is disabled for every reason it could fail at order time, and the
 * reason is said in words. A disabled button with no explanation is a dead end.
 */

type QuoteState =
  | { readonly status: "idle" }
  | { readonly status: "checking" }
  | { readonly status: "ready"; readonly quote: DeliveryQuote }
  | { readonly status: "error"; readonly message: string };

interface BlockedLine {
  readonly name: string;
  readonly reason: string;
}

export function CartView() {
  const { cart, hydrated, subtotalKobo, setQuantity, remove, clear } = useCart();

  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [pointKnown, setPointKnown] = useState(false);
  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });
  const [availability, setAvailability] = useState<KitchenAvailability | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  useEffect(() => {
    const saved = readLocationCookie();
    setPoint(saved ? { lat: saved.lat, lng: saved.lng } : null);
    setPointKnown(true);
  }, []);

  const kitchenSlug = cart?.kitchenSlug ?? null;

  useEffect(() => {
    if (!kitchenSlug) {
      setAvailability(null);
      setAvailabilityError(null);
      return;
    }

    const controller = new AbortController();
    setAvailability(null);
    setAvailabilityError(null);
    fetchAvailability(kitchenSlug, controller.signal)
      .then((result) => setAvailability(result))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setAvailabilityError(
          error instanceof Error ? error.message : "This kitchen could not be loaded.",
        );
      });

    return () => controller.abort();
  }, [kitchenSlug]);

  useEffect(() => {
    if (!kitchenSlug || !point) {
      setQuote({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setQuote({ status: "checking" });
    fetchQuote(point, kitchenSlug, controller.signal)
      .then((result) => setQuote({ status: "ready", quote: result }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setQuote({
          status: "error",
          message: error instanceof Error ? error.message : "Delivery could not be priced.",
        });
      });

    return () => controller.abort();
  }, [kitchenSlug, point?.lat, point?.lng]);

  if (!hydrated || !pointKnown) {
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

  const blocked: BlockedLine[] = [];
  for (const line of cart.lines) {
    const item = availability?.items.get(line.menuItemId);
    if (!item) {
      blocked.push({ name: line.name, reason: "No longer on the menu" });
    } else if (!item.isAvailable) {
      blocked.push({ name: line.name, reason: "Not available right now" });
    }
  }

  const quoteReady = quote.status === "ready" ? quote.quote : null;
  const feeKobo = quoteReady !== null && quoteReady.deliverable ? quoteReady.feeKobo : null;
  const totalKobo = subtotalKobo + (feeKobo ?? 0n);

  const closed = availability !== null && !availability.isOpen;
  const unknownKitchen = quoteReady !== null && !quoteReady.deliverable && quoteReady.reason === "unknown_kitchen";
  const outside = quoteReady !== null && !quoteReady.deliverable && quoteReady.reason !== "unknown_kitchen";

  const canContinue =
    !closed &&
    !unknownKitchen &&
    !outside &&
    blocked.length === 0 &&
    availability !== null &&
    quote.status === "ready" &&
    feeKobo !== null;

  function reasonToHold(): string | null {
    if (availabilityError) return "This kitchen could not be checked. Try again in a moment.";
    if (availability === null) return "Checking this kitchen...";
    if (closed) return "This kitchen is closed right now. Come back when it opens.";
    if (unknownKitchen) return "This kitchen is not taking orders on KanoFood right now.";
    if (blocked.length > 0) return "Remove the dishes that are no longer available to continue.";
    if (!point) return "Set your delivery location to see the delivery fee.";
    if (outside) return "We do not deliver to your saved location yet.";
    if (quote.status === "error") return quote.message;
    if (quote.status !== "ready") return "Pricing delivery...";
    return null;
  }

  const hold = reasonToHold();

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

      <div className="sf-cart__lines">
        {cart.lines.map((line) => {
          const lineTotal = BigInt(line.priceKobo) * BigInt(line.quantity);
          const item = availability?.items.get(line.menuItemId);
          const flag = !item
            ? "No longer on the menu"
            : !item.isAvailable
              ? "Not available right now"
              : null;

          return (
            <div key={line.menuItemId} className={flag ? "sf-cart-line sf-cart-line--blocked" : "sf-cart-line"}>
              <div className="sf-cart-line__body">
                <span className="sf-cart-line__name">{line.name}</span>
                {line.notes ? <span className="sf-cart-line__note">{line.notes}</span> : null}
                {flag ? <span className="sf-cart-line__flag">{flag}</span> : null}
                <span className="sf-cart-line__actions">
                  <span className="sf-qty">
                    <button
                      type="button"
                      className="sf-qty__btn"
                      onClick={() => setQuantity(line.menuItemId, line.quantity - 1)}
                      aria-label={`One fewer ${line.name}`}
                    >
                      -
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

        <div className="sf-cart-total">
          <span>Delivery</span>
          <span>
            {feeKobo !== null ? (
              formatNaira(feeKobo)
            ) : quote.status === "checking" ? (
              <Spinner label="Pricing" />
            ) : (
              "Set at checkout"
            )}
          </span>
        </div>

        <div className="sf-cart-total sf-cart-total--grand">
          <span>Total</span>
          <span>{formatNaira(totalKobo)}</span>
        </div>

        <p className="sf-cart-note">
          {point
            ? "Delivering to your saved location. Delivery is priced from the kitchen to it."
            : "Set a delivery location and the fee appears here before you continue."}
        </p>

        {closed ? (
          <Alert tone="warning" title="This kitchen is closed">
            You can keep your cart, but it cannot be ordered until the kitchen opens.
          </Alert>
        ) : null}

        {outside ? (
          <Alert tone="warning" title="Not in the delivery area">
            Your saved location is outside the delivery area for this kitchen. Try another kitchen
            or change your location.
          </Alert>
        ) : null}

        {unknownKitchen ? (
          <Alert tone="danger" title="This kitchen is not available">
            It is no longer taking orders on KanoFood. Your cart is still here.
          </Alert>
        ) : null}

        {availabilityError ? (
          <Alert tone="danger" title="The kitchen could not be checked">
            {availabilityError}
          </Alert>
        ) : null}

        {!point ? (
          <Link href="/location?next=/cart" className={buttonClass({ variant: "primary", block: true })}>
            Set delivery location
          </Link>
        ) : canContinue ? (
          <Link href="/checkout" className={buttonClass({ variant: "primary", block: true })}>
            Continue to checkout
          </Link>
        ) : (
          <Button type="button" variant="primary" block disabled>
            {hold ?? "Continue to checkout"}
          </Button>
        )}

        {hold && point ? (
          <p className="sf-field__hint" role="status">
            {hold}
          </p>
        ) : null}

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

      <div className="sf-sticky-total">
        <span className="sf-sticky-total__label">
          {cart.lines.reduce((count, line) => count + line.quantity, 0)} items
        </span>
        <span className="sf-sticky-total__amount">{formatNaira(totalKobo)}</span>
        {point ? (
          canContinue ? (
            <Link href="/checkout" className={buttonClass({ variant: "primary", size: "sm" })}>
              Checkout
            </Link>
          ) : (
            <Button type="button" variant="primary" size="sm" disabled>
              Checkout
            </Button>
          )
        ) : (
          <Link href="/location?next=/cart" className={buttonClass({ variant: "primary", size: "sm" })}>
            Add location
          </Link>
        )}
      </div>
    </section>
  );
}
