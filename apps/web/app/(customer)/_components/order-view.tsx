"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatNaira } from "@kanofood/core";
import { Alert, Button, SkeletonText, Timeline, buttonClass } from "@kanofood/ui";

import {
  fetchOrder,
  readStoredAccess,
  type OrderAccess,
  type OrderRead,
} from "./order-api";

/**
 * Screens 4.10 and 4.11, on one route.
 *
 * The URL carries the order number and nothing else: the token stays in this
 * browser and goes as a header, so sharing the link hands over the reference,
 * not the credential. `?placed=1` is the moment after checkout and reads as the
 * confirmation (4.10); without it the page is tracking (4.11); refreshing a
 * tracking page answers "where is my food" without a phone call.
 *
 * Two rules shape the tracking half.
 *
 * **The timeline is the event log, not the status column.** `orders.status` is a
 * cache of the last event, and the page reads the events themselves, so a status
 * that ever falls out of step shows up here rather than hiding behind a pill.
 *
 * **A failed refresh keeps the last known status.** The customer may be on a
 * train; replacing a good timeline with an error screen loses the only thing
 * they came for. The error is shown above it, with the time the shown status was
 * last confirmed, and refresh can be tried again.
 */

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

function formatDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat("en-NG", { timeStyle: "short" }).format(value);
}

/** One person the customer can reach, with the number as the action. */
function ContactRow({
  label,
  name,
  phone,
}: {
  readonly label: string;
  readonly name: string;
  readonly phone: string;
}) {
  return (
    <div className="sf-contact-row">
      <div className="sf-contact-row__body">
        <span className="sf-contact-row__label">{label}</span>
        <span className="sf-contact-row__name">{name}</span>
        <span className="sf-contact-row__phone">{phone}</span>
      </div>
      <a href={`tel:${phone}`} className={buttonClass({ variant: "secondary", size: "sm" })}>
        Call
      </a>
    </div>
  );
}

function DeliveryAddress({ order }: { readonly order: OrderRead }) {
  const address = readAddressSnapshot(order.address);

  return (
    <div className="sf-summary-card">
      {address ? (
        <>
          {address.label ? <span className="sf-summary-card__label">{address.label}</span> : null}
          <span className="sf-summary-card__line">{address.addressText}</span>
          {address.landmark ? (
            <span className="sf-summary-card__line">{address.landmark}</span>
          ) : null}
          {address.instructions ? (
            <span className="sf-summary-card__line">{address.instructions}</span>
          ) : null}
        </>
      ) : (
        <span className="sf-summary-card__line">The delivery address is on the order.</span>
      )}
    </div>
  );
}

function OrderSummary({ order }: { readonly order: OrderRead }) {
  return (
    <>
      <section className="sf-form__section">
        <h2 className="sf-form__heading">Delivery</h2>
        <DeliveryAddress order={order} />
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
              <span className="sf-cart-line__price">
                {formatNaira(BigInt(line.lineTotalKobo))}
              </span>
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
          <span>{formatNaira(BigInt(order.totalKobo))}</span>
        </div>

        <p className="sf-cart-note">
          {PAYMENT_LABELS[order.paymentMethod]}
          {order.paymentMethod === "cod"
            ? `. Have ${formatNaira(BigInt(order.totalKobo))} ready for the rider.`
            : order.paymentMethod === "transfer"
              ? ". The kitchen confirms once the transfer is seen."
              : "."}
        </p>

        {order.deliveryNotes ? <p className="sf-cart-note">Note: {order.deliveryNotes}</p> : null}
      </section>
    </>
  );
}

export function OrderView({
  orderNumber,
  placed,
  platformPhone,
}: {
  readonly orderNumber: string;
  readonly placed: boolean;
  readonly platformPhone: string | null;
}) {
  const [order, setOrder] = useState<OrderRead | null>(null);
  const [access, setAccess] = useState<OrderAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [phonePrompt, setPhonePrompt] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(
    async (nextAccess: OrderAccess, mode: "initial" | "refresh") => {
      setAccess(nextAccess);

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const data = await fetchOrder(orderNumber, nextAccess);
        setOrder(data);
        setRefreshedAt(new Date());
        setPhonePrompt(false);
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "This order could not be loaded right now.",
        );
        // A token that stops working still leaves the phone number as a way in.
        if (!("phone" in nextAccess)) setPhonePrompt(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orderNumber],
  );

  useEffect(() => {
    const stored = readStoredAccess(orderNumber);
    if (stored) {
      void load(stored, "initial");
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
    // A skeleton rather than a spinner: the timeline has a known shape, and a
    // page that reserves its height does not jump when the data arrives.
    return (
      <section className="sf-page" aria-busy="true">
        <span className="kf-visually-hidden">Loading your order</span>
        <SkeletonText lines={6} />
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
            if (phoneInput.trim()) void load({ phone: phoneInput.trim() }, "initial");
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

          {platformPhone ? (
            <p className="sf-field__hint">
              Or call us on{" "}
              <a href={`tel:${platformPhone}`} className="kf-link">
                {platformPhone}
              </a>
              .
            </p>
          ) : null}
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
        {platformPhone ? (
          <p className="sf-field__hint">
            If this keeps happening, call us on{" "}
            <a href={`tel:${platformPhone}`} className="kf-link">
              {platformPhone}
            </a>
            .
          </p>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          block
          loading={refreshing}
          onClick={() => {
            const next = access ?? readStoredAccess(orderNumber);
            if (next) void load(next, "refresh");
            else setPhonePrompt(true);
          }}
        >
          Try again
        </Button>
        <Link href="/" className={buttonClass({ variant: "ghost", block: true })}>
          Back to KanoFood
        </Link>
      </section>
    );
  }

  const lastEvent = order.timeline.length > 0 ? order.timeline[order.timeline.length - 1] : null;

  /* ------------------------------------------------------------ 4.10 */

  if (placed) {
    return (
      <section className="sf-page sf-order">
        <div className="sf-order__head">
          <span className="sf-order__tick" aria-hidden="true">
            ✓
          </span>
          <h1 className="sf-hero__title">Order received</h1>
          <p className="sf-tile__meta">
            {order.kitchen.name} has your order and will call to confirm.
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

        <OrderSummary order={order} />

        <div className="sf-form__body">
          <Link
            href={`/orders/${order.orderNumber}`}
            className={buttonClass({ variant: "primary", block: true })}
          >
            Track this order
          </Link>
          <Button type="button" variant="secondary" block onClick={() => void share()}>
            Share tracking link
          </Button>
          {copied ? (
            <p className="sf-field__hint" role="status">
              {copied}
            </p>
          ) : null}

          <Link
            href={`/kitchens/${order.kitchen.slug}`}
            className={buttonClass({ variant: "ghost", block: true })}
          >
            Order from {order.kitchen.name} again
          </Link>
          <Link href="/" className={buttonClass({ variant: "ghost", block: true })}>
            Back to home
          </Link>
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------------ 4.11 */

  return (
    <section className="sf-page sf-track">
      <div className="sf-track__head">
        <span className="sf-tile__meta">
          {order.kitchen.name} · Order {order.orderNumber}
        </span>
        <h1 className="sf-track__status">{order.statusLabel}</h1>
        <span className="sf-field__hint">
          {refreshedAt ? `Last updated ${formatTime(refreshedAt)}` : "Not updated yet"}
          {lastEvent ? ` · ${formatDateTime(lastEvent.at)}` : ""}
        </span>
      </div>

      {error ? (
        <Alert tone="warning" title="Could not refresh">
          {error} The status below is the last one we saw
          {refreshedAt ? `, at ${formatTime(refreshedAt)}` : ""}.
        </Alert>
      ) : null}

      <section className="sf-form__section">
        <h2 className="sf-form__heading">Progress</h2>
        <Timeline
          label="Order progress"
          items={order.timeline.map((event, index) => ({
            id: event.id,
            title: event.label,
            time: formatDateTime(event.at),
            body:
              event.reason || event.note ? (
                <>
                  {event.reason ? <span>{event.reason}</span> : null}
                  {event.note ? <span className="sf-track__note">{event.note}</span> : null}
                </>
              ) : undefined,
            current: index === order.timeline.length - 1,
          }))}
        />
      </section>

      {order.rider || order.kitchen.phone || platformPhone ? (
        <section className="sf-form__section">
          <h2 className="sf-form__heading">Contact</h2>
          {order.rider ? (
            <ContactRow label="Rider" name={order.rider.name} phone={order.rider.phone} />
          ) : null}
          {order.kitchen.phone ? (
            <ContactRow
              label="Kitchen"
              name={order.kitchen.name}
              phone={order.kitchen.phone}
            />
          ) : null}
          {platformPhone ? (
            <ContactRow label="Platform" name="KanoFood support" phone={platformPhone} />
          ) : null}
        </section>
      ) : null}

      <OrderSummary order={order} />

      <div className="sf-form__body">
        {order.canCancel ? (
          <Link
            href={`/orders/${order.orderNumber}/cancel`}
            className={buttonClass({ variant: "danger", block: true })}
          >
            Request cancellation
          </Link>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          block
          loading={refreshing}
          onClick={() => {
            if (access) void load(access, "refresh");
          }}
        >
          Refresh status
        </Button>
        <Link href="/help" className={buttonClass({ variant: "ghost", block: true })}>
          Help and contact
        </Link>
      </div>

      {/* Sticky on a phone, where the timeline can push the status off-screen. */}
      <div className="sf-track-sticky" aria-hidden="true">
        <span className="sf-track-sticky__status">{order.statusLabel}</span>
        <span className="sf-track-sticky__time">
          {refreshedAt ? formatTime(refreshedAt) : ""}
        </span>
      </div>
    </section>
  );
}
