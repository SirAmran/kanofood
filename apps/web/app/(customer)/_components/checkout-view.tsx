"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { formatNaira } from "@kanofood/core";
import { Alert, Button, EmptyState, buttonClass } from "@kanofood/ui";

import { useCart } from "./cart-provider";
import { readAddress, readCustomer, saveOrderPhone, saveOrderToken, writeCustomer, type DeliveryAddress } from "./checkout-store";
import { fetchQuote, type DeliveryQuote } from "./storefront-api";

/**
 * Screen 4.9, checkout.
 *
 * Three fields to fill, because the address was collected on 4.8 and asking for
 * it again is how a checkout grows into a form nobody finishes. The address is
 * shown back in full with a link to change it, which is the confirmation the
 * spec asks for.
 *
 * Card is not offered. There is no gateway, and a card option that ends in a
 * dead end is worse than a screen that says cash or transfer. Cash is hidden
 * when the zone requires prepayment, because the order route would refuse it.
 *
 * The amounts shown here come from the same quote the server recomputes at
 * placement. The client never sends a price: the request body has none in it,
 * and the order carries whatever the server worked out from the menu and the
 * point, which may differ from this screen if an admin changed a price in the
 * last minute. That difference lands on the confirmation screen, which shows the
 * order as it was actually placed.
 */

type QuoteState =
  | { readonly status: "idle" }
  | { readonly status: "checking" }
  | { readonly status: "ready"; readonly quote: DeliveryQuote }
  | { readonly status: "error"; readonly message: string };

interface PlacedOrder {
  readonly orderNumber: string;
  readonly token: string;
}

function cleanPhone(value: string): string {
  return value.replace(/[\s()-]/g, "");
}

export function CheckoutView({ platformPhone }: { readonly platformPhone: string | null }) {
  const router = useRouter();
  const { cart, hydrated, subtotalKobo, clear } = useCart();

  const [ready, setReady] = useState(false);
  const [address, setAddress] = useState<DeliveryAddress | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [payment, setPayment] = useState<"cod" | "transfer">("cod");

  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const savedAddress = readAddress();
    const savedCustomer = readCustomer();
    setAddress(savedAddress);
    if (savedCustomer) {
      setName(savedCustomer.name);
      setPhone(savedCustomer.phone);
    }
    setReady(true);
  }, []);

  const kitchenSlug = cart?.kitchenSlug ?? null;

  useEffect(() => {
    if (!kitchenSlug || !address) {
      setQuote({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setQuote({ status: "checking" });
    fetchQuote({ lat: address.lat, lng: address.lng }, kitchenSlug, controller.signal)
      .then((result) => setQuote({ status: "ready", quote: result }))
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setQuote({
          status: "error",
          message: failure instanceof Error ? failure.message : "Delivery could not be priced.",
        });
      });

    return () => controller.abort();
  }, [kitchenSlug, address?.lat, address?.lng]);

  const quoted = quote.status === "ready" ? quote.quote : null;
  const prepaidRequired =
    quoted !== null && quoted.deliverable && quoted.paymentRequirement === "prepaid_required";

  // The zone's rule wins over whatever was chosen a moment ago. A cash option
  // that the server is going to refuse is not an option.
  useEffect(() => {
    if (prepaidRequired) setPayment("transfer");
  }, [prepaidRequired]);

  if (!hydrated || !ready) {
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
        There is nothing to check out yet.
      </EmptyState>
    );
  }

  const feeKobo = quoted !== null && quoted.deliverable ? quoted.feeKobo : null;
  const totalKobo = subtotalKobo + (feeKobo ?? 0n);
  const outside = quoted !== null && !quoted.deliverable;

  async function placeOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(null);

    if (!cart) return;

    if (!address) {
      setFieldError("Add a delivery address before placing the order.");
      return;
    }
    if (name.trim() === "") {
      setFieldError("Enter the name the rider should ask for.");
      return;
    }
    if (!/^\+?\d{7,15}$/.test(cleanPhone(phone))) {
      setFieldError("Enter a phone number we can call about this order.");
      return;
    }
    if (!quoted?.deliverable || feeKobo === null) {
      setFieldError("Delivery has not been priced yet. Wait a moment and try again.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kitchenSlug: cart.kitchenSlug,
          lines: cart.lines.map((line) => ({
            menuItemId: line.menuItemId,
            quantity: line.quantity,
            ...(line.notes ? { notes: line.notes } : {}),
          })),
          customer: { name: name.trim(), phone: phone.trim() },
          address: {
            label: address.label,
            addressText: address.addressText,
            ...(address.landmark ? { landmark: address.landmark } : {}),
            ...(address.instructions ? { instructions: address.instructions } : {}),
            lat: address.lat,
            lng: address.lng,
          },
          paymentMethod: payment,
          ...(deliveryNotes.trim() ? { deliveryNotes: deliveryNotes.trim() } : {}),
        }),
      });

      const body = (await response.json()) as
        | { readonly ok: true; readonly data: PlacedOrder }
        | { readonly ok: false; readonly error: { readonly message: string } };

      if (!response.ok || !body.ok) {
        throw new Error(
          body.ok === false ? body.error.message : "The order could not be placed. Try again.",
        );
      }

      saveOrderToken(body.data.orderNumber, body.data.token);
      saveOrderPhone(body.data.orderNumber, phone.trim());
      writeCustomer({ name: name.trim(), phone: phone.trim() });
      clear();
      router.push(`/orders/${body.data.orderNumber}?placed=1`);
    } catch (failure) {
      setSubmitting(false);
      setError(
        failure instanceof Error
          ? failure.message
          : "The order was not placed. Your cart and details are still here.",
      );
    }

    // On success the navigation unmounts this screen. On failure submitting is
    // cleared above, and the inputs keep everything that was typed.
  }

  return (
    <section className="sf-page">
      <div className="sf-hero">
        <h1 className="sf-hero__title">Checkout</h1>
        <p className="sf-tile__meta">
          From{" "}
          <Link href={`/kitchens/${cart.kitchenSlug}`} className="kf-link">
            {cart.kitchenName}
          </Link>
        </p>
      </div>

      <form className="sf-form sf-form__body" onSubmit={placeOrder}>
        <section className="sf-form__section">
          <h2 className="sf-form__heading">Your details</h2>
          <label className="kf-field">
            <span className="kf-label">Name</span>
            <input
              className="kf-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name for the rider"
              maxLength={120}
              autoComplete="name"
              required
            />
          </label>
          <label className="kf-field">
            <span className="kf-label">Phone</span>
            <input
              className="kf-input"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="080..."
              inputMode="tel"
              maxLength={20}
              autoComplete="tel"
              required
            />
            <span className="sf-field__hint">We call this number to confirm the order.</span>
          </label>
        </section>

        <section className="sf-form__section">
          <h2 className="sf-form__heading">Deliver to</h2>
          {address ? (
            <div className="sf-summary-card">
              <span className="sf-summary-card__label">{address.label}</span>
              <span className="sf-summary-card__line">{address.addressText}</span>
              {address.landmark ? (
                <span className="sf-summary-card__line">{address.landmark}</span>
              ) : null}
              {address.instructions ? (
                <span className="sf-summary-card__line">{address.instructions}</span>
              ) : null}
              <Link href="/location?next=/checkout" className="kf-link">
                Change address
              </Link>
            </div>
          ) : (
            <Alert tone="warning" title="No delivery address yet">
              <Link href="/location?next=/checkout" className="kf-link">
                Set your delivery location
              </Link>{" "}
              to continue.
            </Alert>
          )}
        </section>

        <section className="sf-form__section">
          <h2 className="sf-form__heading">Payment</h2>
          {prepaidRequired ? (
            <p className="sf-field__hint">
              This area is paid by transfer before the kitchen starts cooking.
            </p>
          ) : (
            <p className="sf-field__hint">
              Pay cash when the rider arrives, or transfer before delivery.
            </p>
          )}

          {!prepaidRequired ? (
            <label className="sf-choice">
              <input
                type="radio"
                name="payment"
                value="cod"
                checked={payment === "cod"}
                onChange={() => setPayment("cod")}
              />
              <span>
                <span className="sf-choice__title">Cash on delivery</span>
                <span className="sf-choice__note">
                  Have {formatNaira(totalKobo)} ready for the rider.
                </span>
              </span>
            </label>
          ) : null}

          <label className="sf-choice">
            <input
              type="radio"
              name="payment"
              value="transfer"
              checked={payment === "transfer"}
              onChange={() => setPayment("transfer")}
            />
            <span>
              <span className="sf-choice__title">Bank transfer</span>
              <span className="sf-choice__note">
                The kitchen confirms the order once the transfer is seen.
              </span>
            </span>
          </label>

          <p className="sf-field__hint">Card payment is not available yet.</p>
        </section>

        <section className="sf-form__section">
          <h2 className="sf-form__heading">Order summary</h2>
          <div className="sf-cart__lines">
            {cart.lines.map((line) => (
              <div key={line.menuItemId} className="sf-cart-line sf-cart-line--compact">
                <div className="sf-cart-line__body">
                  <span className="sf-cart-line__name">
                    {line.quantity} x {line.name}
                  </span>
                  {line.notes ? <span className="sf-cart-line__note">{line.notes}</span> : null}
                </div>
                <span className="sf-cart-line__price">
                  {formatNaira(BigInt(line.priceKobo) * BigInt(line.quantity))}
                </span>
              </div>
            ))}
          </div>

          <div className="sf-cart-total">
            <span>Subtotal</span>
            <span>{formatNaira(subtotalKobo)}</span>
          </div>
          <div className="sf-cart-total">
            <span>Delivery</span>
            <span>{feeKobo !== null ? formatNaira(feeKobo) : "Pricing..."}</span>
          </div>
          <div className="sf-cart-total sf-cart-total--grand">
            <span>Total</span>
            <span>{formatNaira(totalKobo)}</span>
          </div>
        </section>

        <label className="kf-field">
          <span className="kf-label">Notes (optional)</span>
          <textarea
            className="kf-input sf-textarea"
            value={deliveryNotes}
            onChange={(event) => setDeliveryNotes(event.target.value)}
            placeholder="Anything the kitchen or rider should know"
            maxLength={500}
            rows={2}
          />
        </label>

        {outside ? (
          <Alert tone="warning" title="We do not deliver to this address yet">
            Change the address, or call{" "}
            {platformPhone ? (
              <a href={`tel:${platformPhone}`} className="kf-link">
                {platformPhone}
              </a>
            ) : (
              "the platform"
            )}{" "}
            to ask about your area.
          </Alert>
        ) : null}

        {quote.status === "error" ? (
          <Alert tone="danger" title="Delivery could not be priced">
            {quote.message}
          </Alert>
        ) : null}

        {fieldError ? <Alert tone="warning">{fieldError}</Alert> : null}

        {error ? (
          <Alert tone="danger" title="Your order was not placed">
            {error} Nothing was charged and nothing was lost. Try again.
          </Alert>
        ) : null}

        <p className="sf-field__hint">
          The kitchen will call {phone.trim() || "your phone"} to confirm this order.
        </p>

        <Button
          type="submit"
          variant="primary"
          block
          disabled={
            submitting ||
            !address ||
            outside ||
            quote.status !== "ready" ||
            feeKobo === null
          }
        >
          {submitting ? "Placing order..." : `Place order · ${formatNaira(totalKobo)}`}
        </Button>
      </form>
    </section>
  );
}
