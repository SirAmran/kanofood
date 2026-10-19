"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  CANCELLATION_REASONS,
  CANCELLATION_REASON_LABELS,
  type CancellationReason,
} from "@kanofood/core";
import { Alert, Button, Spinner, buttonClass } from "@kanofood/ui";

import {
  fetchOrder,
  readStoredAccess,
  requestCancellation,
  type CancelledOrder,
  type OrderAccess,
  type OrderRead,
} from "./order-api";

/**
 * Screen 4.12, cancellation.
 *
 * A route rather than the bottom sheet the specification draws, for the reason
 * already banked on dish detail: a URL is shareable, back-safe and testable, and
 * the sheet can be a presentation of the same page later. The screen reads the
 * order first, so a cancellation that is no longer allowed is explained before
 * anybody picks a reason, rather than refused after they have committed to one.
 *
 * The reason is required because the domain requires it. The explanation is
 * optional because it is what the customer would have said down the phone, and
 * the kitchen is the reader who benefits from it.
 */

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** Why cancellation is closed, said in the words that are actually true. */
function closedExplanation(status: string): string {
  if (status === "CUSTOMER_CANCELLED") return "This order has already been cancelled.";
  if (status === "RIDER_ASSIGNED" || status === "PICKED_UP" || status === "OUT_FOR_DELIVERY") {
    return "A rider is already on this order, so it can no longer be cancelled here. Call the platform and we will sort it out.";
  }
  return "This order has already ended and can no longer be cancelled.";
}

export function CancelView({
  orderNumber,
  platformPhone,
}: {
  readonly orderNumber: string;
  readonly platformPhone: string | null;
}) {
  const [order, setOrder] = useState<OrderRead | null>(null);
  const [access, setAccess] = useState<OrderAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phonePrompt, setPhonePrompt] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");

  const [reason, setReason] = useState<CancellationReason | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState<CancelledOrder | null>(null);

  useEffect(() => {
    const stored = readStoredAccess(orderNumber);
    if (!stored) {
      setLoading(false);
      setPhonePrompt(true);
      return;
    }

    setAccess(stored);
    void (async () => {
      try {
        setOrder(await fetchOrder(orderNumber, stored));
      } catch (failure) {
        setLoadError(
          failure instanceof Error ? failure.message : "This order could not be loaded.",
        );
        setPhonePrompt(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [orderNumber]);

  async function loadWithPhone(phone: string) {
    const next: OrderAccess = { phone };
    setAccess(next);
    setLoading(true);
    setLoadError(null);

    try {
      setOrder(await fetchOrder(orderNumber, next));
      setPhonePrompt(false);
    } catch (failure) {
      setLoadError(
        failure instanceof Error ? failure.message : "This order could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason || !access) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      setCancelled(
        await requestCancellation({
          orderNumber,
          access,
          reason,
          note,
        }),
      );
    } catch (failure) {
      setSubmitError(
        failure instanceof Error
          ? failure.message
          : "The order could not be cancelled. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className="sf-page">
        <Spinner label="Loading your order" />
      </section>
    );
  }

  if (cancelled) {
    return (
      <section className="sf-page sf-order">
        <div className="sf-order__head">
          <span className="sf-order__tick" aria-hidden="true">
            ✓
          </span>
          <h1 className="sf-hero__title">Order cancelled</h1>
          <p className="sf-tile__meta">
            {cancelled.orderNumber} was cancelled on {formatDateTime(cancelled.cancelledAt)}.
          </p>
        </div>

        <div className="sf-order-card">
          <span className="sf-order-card__label">Status</span>
          <span className="sf-order-card__status">{cancelled.statusLabel}</span>
          {reason ? (
            <>
              <span className="sf-order-card__label">Reason recorded</span>
              <span className="sf-order-card__number">{CANCELLATION_REASON_LABELS[reason]}</span>
            </>
          ) : null}
        </div>

        <Alert tone="info" title="Nothing is charged">
          The kitchen has been told. If you already sent a bank transfer, call us and we will
          arrange the refund.
          {platformPhone ? (
            <>
              {" "}
              <a href={`tel:${platformPhone}`} className="kf-link">
                {platformPhone}
              </a>
            </>
          ) : null}
        </Alert>

        <div className="sf-form__body">
          <Link
            href={`/orders/${cancelled.orderNumber}`}
            className={buttonClass({ variant: "primary", block: true })}
          >
            View the order
          </Link>
          <Link href="/" className={buttonClass({ variant: "ghost", block: true })}>
            Back to home
          </Link>
        </div>
      </section>
    );
  }

  if (!order && phonePrompt) {
    return (
      <section className="sf-page">
        <div className="sf-hero">
          <h1 className="sf-hero__title">Cancel an order</h1>
          <p className="sf-tile__meta">
            Enter the phone number the order was placed with, so we can find it.
          </p>
        </div>

        <form
          className="sf-form sf-form__body"
          onSubmit={(event) => {
            event.preventDefault();
            if (phoneInput.trim()) void loadWithPhone(phoneInput.trim());
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

          {loadError ? <Alert tone="danger">{loadError}</Alert> : null}

          <Button type="submit" variant="primary" block>
            Find my order
          </Button>
        </form>
      </section>
    );
  }

  if (!order) {
    return (
      <section className="sf-page">
        <Alert tone="danger" title="This order could not be loaded">
          {loadError ?? "Try again from the link in your confirmation."}
        </Alert>
        {platformPhone ? (
          <p className="sf-field__hint">
            Call us on{" "}
            <a href={`tel:${platformPhone}`} className="kf-link">
              {platformPhone}
            </a>{" "}
            and we will cancel it for you.
          </p>
        ) : null}
        <Link href={`/orders/${orderNumber}`} className={buttonClass({ variant: "secondary", block: true })}>
          Back to the order
        </Link>
      </section>
    );
  }

  if (!order.canCancel) {
    return (
      <section className="sf-page">
        <div className="sf-hero">
          <h1 className="sf-hero__title">This order cannot be cancelled here</h1>
          <p className="sf-tile__meta">{closedExplanation(order.status)}</p>
        </div>

        {platformPhone ? (
          <Alert tone="info" title="Call us">
            <a href={`tel:${platformPhone}`} className="kf-link">
              {platformPhone}
            </a>
          </Alert>
        ) : null}

        <div className="sf-form__body">
          <Link
            href={`/orders/${order.orderNumber}`}
            className={buttonClass({ variant: "primary", block: true })}
          >
            Back to the order
          </Link>
          <Link href="/help" className={buttonClass({ variant: "ghost", block: true })}>
            Help and contact
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="sf-page">
      <div className="sf-hero">
        <h1 className="sf-hero__title">Cancel order {order.orderNumber}</h1>
        <p className="sf-tile__meta">
          {order.kitchen.name} will be told once you confirm. This cannot be undone.
        </p>
      </div>

      <Alert tone="info" title="What happens next">
        Nothing is charged for a cancelled order. If you already sent a bank transfer, call us and
        we will arrange the refund.
      </Alert>

      <form className="sf-form sf-form__body" onSubmit={(event) => void submit(event)}>
        <fieldset className="sf-coords">
          <legend className="kf-label">Why are you cancelling?</legend>
          {CANCELLATION_REASONS.map((value) => (
            <label key={value} className="sf-choice">
              <input
                type="radio"
                name="reason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
              />
              <span>
                <span className="sf-choice__title">{CANCELLATION_REASON_LABELS[value]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="kf-field">
          <span className="kf-label">Anything else we should know? (optional)</span>
          <textarea
            className="kf-input sf-textarea"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="For example: I ordered the wrong dish."
          />
        </label>

        {submitError ? (
          <Alert tone="danger" title="The cancellation did not go through">
            {submitError}
            {platformPhone ? (
              <>
                {" "}
                Call us on{" "}
                <a href={`tel:${platformPhone}`} className="kf-link">
                  {platformPhone}
                </a>{" "}
                and we will cancel it for you.
              </>
            ) : null}
          </Alert>
        ) : null}

        <Button type="submit" variant="danger" block loading={submitting} disabled={!reason}>
          Cancel this order
        </Button>

        <Link
          href={`/orders/${order.orderNumber}`}
          className={buttonClass({ variant: "ghost", block: true })}
        >
          Keep the order
        </Link>
      </form>
    </section>
  );
}
