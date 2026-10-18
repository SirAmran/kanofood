"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatNaira } from "@kanofood/core";
import { Alert, Button, buttonClass, Spinner } from "@kanofood/ui";

import { readOrderPhone, readOrderToken } from "./checkout-store";

/**
 * Screen 4.10, the confirmation.
 *
 * It is a read of the order that was just placed, not a copy of what the
 * checkout screen thought it was placing: the number, items, fees and status all
 * come back from the order row. That matters because the server recomputes every
 * amount, and the confirmation is the first place the customer sees what was
 * actually recorded.
 *
 * The token lives in this browser's storage, keyed by order number, and is sent
 * as a header. The URL carries the order number only, so a link shared over
 * WhatsApp does not hand out the credential; the other person has to know the
 * phone number the order was placed with, which they do if they are the one
 * picking up the food, and do not if they are not.
 */

interface OrderLine {
  readonly name: string;
  readonly unitPriceKobo: string;
  readonly quantity: number;
  readonly lineTotalKobo: string;
  readonly notes: string | null;
}

interface OrderRead {
  readonly orderNumber: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly placedAt: string;
  readonly kitchen: { readonly name: string; readonly slug: string; readonly phone: string | null };
  readonly etaMinutes: number | null;
  readonly address: unknown;
  readonly lines: readonly OrderLine[];
  readonly subtotalKobo: string;
  readonly deliveryFeeKobo: string;
  readonly totalKobo: string;
  readonly paymentMethod: "cod" | "transfer" | "card";
  readonly deliveryNotes: string | null;
}

interface AddressSnapshot {
  readonly label: string | null;
  readonly addressText: string;
  readonly landmark: string | null;
  readonly instructions: string | null;
}

const PAYMENT_LABELS: Record<OrderRead["paymentMethod"], string> = {
  cod: "Cash on delivery",
  transfer: "Bank transfer",
  card: "Card",
};

function readAddressSnapshot(value: unknown): AddressSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const address = value as Record<string, unknown>;
  if (typeof address.addressText !== "string") return null;

  return {
    label: typeof address.label === "string" ? address.label : null,
    addressText: address.addressText,
    landmark: typeof address.landmark === "string" ? address.landmark : null,
    instructions: typeof address.instructions === "string" ? address.instructions : null,
  };
}

function formatPlacedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function OrderView({
  orderNumber,
  placed,
}: {
  readonly orderNumber: string;
  readonly placed: boolean;
}) {
  const [order, setOrder] = useState<OrderRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phonePrompt, setPhonePrompt] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(
    async (access: { token: string } | { phone: string }) => {
      setLoading(true);
      setError(null);

      const token = "token" in access ? access.token : null;
      const phone = "phone" in access ? access.phone : null;
      const query = phone ? `?phone=${encodeURIComponent(phone)}` : "";

      try {
        const response = await fetch(`/api/v1/orders/${encodeURIComponent(orderNumber)}${query}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const body = (await response.json()) as
          | { readonly ok: true; readonly data: OrderRead }
          | { readonly ok: false; readonly error: { readonly message: string } };

        if (!response.ok || !body.ok) {
          throw new Error(
            body.ok === false ? body.error.message : "This order could not be loaded.",
          );
        }

        setOrder(body.data);
        setPhonePrompt(false);
      } catch (failure) {
        setError(
          failure instanceof Error ? failure.message : "This order could not be loaded right now.",
        );
        // A token that stops working still leaves the phone number as a way in.
        if (!phone) setPhonePrompt(true);
      } finally {
        setLoading(false);
      }
    },
    [orderNumber],
  );

  useEffect(() => {
    const token = readOrderToken(orderNumber);
    if (token) {
      void load({ token });
      return;
    }

    const savedPhone = readOrderPhone(orderNumber);
    if (savedPhone) {
      void load({ phone: savedPhone });
      return;
    }

    setLoading(false);
    setPhonePrompt(true);
  }, [orderNumber, load]);

  const trackingUrl =
    typeof window === "undefined" ? "" : `${window.location.origin}/orders/${orderNumber}`;

  async function share() {
    if (!trackingUrl) return;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `KanoFood order ${orderNumber}`, url: trackingUrl });
        return;
      } catch {
        // Cancelled or unsupported after all; fall through to copying.
      }
    }

    try {
      await navigator.clipboard.writeText(trackingUrl);
      setCopied("Link copied.");
    } catch {
      setCopied("Could not copy. The order link is in the address bar.");
    }
  }

  if (loading) {
    return (
      <section className="sf-page">
        <Spinner label="Loading your order" />
      </section>
    );
  }

  if (phonePrompt && !order) {
    return (
      <section className="sf-page">
        <div className="sf-hero">
          <h1 className="sf-hero__title">Find your order</h1>
          <p className="sf-tile__meta">
            This browser does not have the order saved. Enter the phone number it was placed with.
          </p>
        </div>

        <form
          className="sf-form sf-form__body"
          onSubmit={(event) => {
            event.preventDefault();
            if (phoneInput.trim()) void load({ phone: phoneInput.trim() });
          }}
        >
          <label className="kf-field">
            <span className="kf-label">Phone number</span>
            <input
              className="kf-input"
              value={phoneInput}
              onChange={(event) => setPhoneInput(event.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="080..."
              required
            />
          </label>

          {error ? <Alert tone="danger">{error}</Alert> : null}

          <Button type="submit" variant="primary" block>
            View order
          </Button>
        </form>
      </section>
    );
  }

  if (!order) {
    return (
      <section className="sf-page">
        <Alert tone="danger" title="This order could not be loaded">
          {error ?? "Try again from the link in your confirmation."}
        </Alert>
        <Link href="/" className={buttonClass({ variant: "secondary", block: true })}>
          Back to KanoFood
        </Link>
      </section>
    );
  }

  const address = readAddressSnapshot(order.address);
  const totalKobo = BigInt(order.totalKobo);

  return (
    <section className="sf-page sf-order">
      <div className="sf-order__head">
        <span className="sf-order__tick" aria-hidden="true">
          {placed ? "✓" : ""}
        </span>
        <h1 className="sf-hero__title">{placed ? "Order received" : "Your order"}</h1>
        <p className="sf-tile__meta">
          {placed
            ? `${order.kitchen.name} has your order and will call to confirm.`
            : `Placed with ${order.kitchen.name} on ${formatPlacedAt(order.placedAt)}.`}
        </p>
      </div>

      <div className="sf-order-card">
        <span className="sf-order-card__label">Order number</span>
        <span className="sf-order-card__number">{order.orderNumber}</span>
        <span className="sf-order-card__status">{order.statusLabel}</span>
      </div>

      <Alert tone="info" title="The kitchen will call you">
        Keep your phone nearby.{" "}
        {order.kitchen.phone ? (
          <>
            You can also call the kitchen on{" "}
            <a href={`tel:${order.kitchen.phone}`} className="kf-link">
              {order.kitchen.phone}
            </a>
            .
          </>
        ) : (
          "The kitchen confirms every order by phone before cooking."
        )}
      </Alert>

      <section className="sf-form__section">
        <h2 className="sf-form__heading">Delivery</h2>
        {address ? (
          <div className="sf-summary-card">
            {address.label ? <span className="sf-summary-card__label">{address.label}</span> : null}
            <span className="sf-summary-card__line">{address.addressText}</span>
            {address.landmark ? (
              <span className="sf-summary-card__line">{address.landmark}</span>
            ) : null}
            {address.instructions ? (
              <span className="sf-summary-card__line">{address.instructions}</span>
            ) : null}
          </div>
        ) : (
          <p className="sf-field__hint">The delivery address is on the order.</p>
        )}

        <p className="sf-field__hint">
          {order.etaMinutes
            ? `The kitchen usually takes about ${order.etaMinutes} minutes to prepare. Delivery time depends on the rider.`
            : "The kitchen has not set a preparation time. They will give you one when they call."}
        </p>
      </section>

      <section className="sf-form__section">
        <h2 className="sf-form__heading">Your order</h2>
        <div className="sf-cart__lines">
          {order.lines.map((line, index) => (
            <div key={`${line.name}-${index}`} className="sf-cart-line sf-cart-line--compact">
              <div className="sf-cart-line__body">
                <span className="sf-cart-line__name">
                  {line.quantity} x {line.name}
                </span>
                {line.notes ? <span className="sf-cart-line__note">{line.notes}</span> : null}
              </div>
              <span className="sf-cart-line__price">{formatNaira(BigInt(line.lineTotalKobo))}</span>
            </div>
          ))}
        </div>

        <div className="sf-cart-total">
          <span>Subtotal</span>
          <span>{formatNaira(BigInt(order.subtotalKobo))}</span>
        </div>
        <div className="sf-cart-total">
          <span>Delivery</span>
          <span>{formatNaira(BigInt(order.deliveryFeeKobo))}</span>
        </div>
        <div className="sf-cart-total sf-cart-total--grand">
          <span>Total</span>
          <span>{formatNaira(totalKobo)}</span>
        </div>

        <p className="sf-cart-note">
          {PAYMENT_LABELS[order.paymentMethod]}
          {order.paymentMethod === "cod"
            ? `. Have ${formatNaira(totalKobo)} ready for the rider.`
            : order.paymentMethod === "transfer"
              ? ". The kitchen confirms once the transfer is seen."
              : "."}
        </p>

        {order.deliveryNotes ? (
          <p className="sf-cart-note">Note: {order.deliveryNotes}</p>
        ) : null}
      </section>

      <div className="sf-form__body">
        <Button type="button" variant="secondary" block onClick={() => void share()}>
          Share tracking link
        </Button>
        {copied ? (
          <p className="sf-field__hint" role="status">
            {copied}
          </p>
        ) : null}

        <Link href={`/kitchens/${order.kitchen.slug}`} className={buttonClass({ variant: "ghost", block: true })}>
          Order from {order.kitchen.name} again
        </Link>
        <Link href="/" className={buttonClass({ variant: "ghost", block: true })}>
          Back to home
        </Link>
      </div>
    </section>
  );
}
