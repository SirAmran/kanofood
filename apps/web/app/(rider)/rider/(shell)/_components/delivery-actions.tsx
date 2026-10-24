"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DELIVERY_FAILURE_REASON_LABELS, DELIVERY_FAILURE_REASONS } from "@kanofood/core";
import type { DeliveryFailureReason, OrderStatus } from "@kanofood/core";
import { Alert, Button, Field, Select, Stack, Textarea, useToast } from "@kanofood/ui";

/**
 * The moves a rider can make on one delivery. Screens 6.2, 6.3 and 6.5.
 *
 * One implementation for the card and the detail page, because two copies of the
 * failure form drift the first time only one of them is fixed.
 *
 * The page sends the moves the server will accept, so this offers exactly those
 * and the API re-checks every one. `from` is the status the page was rendered
 * with, and the write is conditional on it: a page left open while somebody else
 * acted gets a conflict rather than silently overwriting them.
 *
 * A failed delivery needs a reason from a fixed list. UX_SPEC section 6.5 names
 * five and PRODUCT_SPEC section 8 names none, so the five live in core as typed
 * values and are read from there rather than spelled out again here.
 */

const ACTION_LABELS: Readonly<Partial<Record<OrderStatus, string>>> = {
  PICKED_UP: "Mark picked up",
  OUT_FOR_DELIVERY: "Start delivery",
  DELIVERED: "Mark delivered",
};

export interface DeliveryActionsProps {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  /** The statuses this rider may move to, as the server reported them. */
  readonly actions: readonly OrderStatus[];
  /** Large buttons for the phone-sized card; the detail page can use the same. */
  readonly size?: "lg" | "md";
}

export function DeliveryActions({
  orderId,
  orderNumber,
  status,
  actions,
  size = "lg",
}: DeliveryActionsProps) {
  const router = useRouter();
  const toast = useToast();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failing, setFailing] = useState(false);
  const [reasonCode, setReasonCode] = useState<DeliveryFailureReason>("CUSTOMER_UNREACHABLE");
  const [note, setNote] = useState("");

  const tall = size === "lg" ? { minHeight: "56px" } : undefined;

  async function move(to: OrderStatus) {
    if (busy) return;
    setBusy(to);
    setError(null);

    try {
      const response = await fetch(`/api/v1/rider/deliveries/${orderId}/transition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from: status, to }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: { message?: string } };
      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? "That did not go through.");
        setBusy(null);
        return;
      }

      toast?.push(`Order ${orderNumber} updated.`);
      setBusy(null);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check the connection and try again.");
      setBusy(null);
    }
  }

  async function reportFailure() {
    if (busy) return;
    setBusy("DELIVERY_FAILED");
    setError(null);

    try {
      const response = await fetch(`/api/v1/rider/deliveries/${orderId}/transition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from: status,
          to: "DELIVERY_FAILED",
          reasonCode,
          note: note.trim() || undefined,
        }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: { message?: string } };
      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? "That did not go through.");
        setBusy(null);
        return;
      }

      toast?.push(`Order ${orderNumber} reported as failed. The office will follow up.`);
      setBusy(null);
      setFailing(false);
      setNote("");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check the connection and try again.");
      setBusy(null);
    }
  }

  if (actions.length === 0) return null;

  return (
    <Stack>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {(["PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"] as const).map((to) =>
        actions.includes(to) ? (
          <Button
            key={to}
            type="button"
            variant="primary"
            size={size}
            block
            loading={busy === to}
            disabled={busy !== null}
            style={tall}
            onClick={() => void move(to)}
          >
            {ACTION_LABELS[to]}
          </Button>
        ) : null,
      )}

      {actions.includes("DELIVERY_FAILED") ? (
        failing ? (
          <div style={{ display: "grid", gap: "var(--space-2)" }}>
            <Field label="What went wrong" htmlFor={`reason-${orderId}`} required>
              <Select
                id={`reason-${orderId}`}
                name={`reason-${orderId}`}
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value as DeliveryFailureReason)}
                style={{ minHeight: "52px", fontSize: "16px" }}
              >
                {DELIVERY_FAILURE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {DELIVERY_FAILURE_REASON_LABELS[reason]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Anything else" htmlFor={`note-${orderId}`} hint="Optional.">
              <Textarea
                id={`note-${orderId}`}
                name={`note-${orderId}`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                maxLength={500}
              />
            </Field>

            <p className="kf-muted">
              The office sees this straight away and will call the customer. The order stays on
              your list until they close it.
            </p>

            <div
              style={{ display: "grid", gap: "var(--space-2)", gridTemplateColumns: "1fr 1fr" }}
            >
              <Button
                type="button"
                variant="ghost"
                size={size}
                block
                disabled={busy !== null}
                onClick={() => setFailing(false)}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="danger"
                size={size}
                block
                loading={busy === "DELIVERY_FAILED"}
                disabled={busy !== null}
                onClick={() => void reportFailure()}
              >
                Report failed
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size={size}
            block
            disabled={busy !== null}
            style={tall}
            onClick={() => setFailing(true)}
          >
            Report a problem
          </Button>
        )
      ) : null}
    </Stack>
  );
}
