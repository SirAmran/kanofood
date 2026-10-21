"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { KITCHEN_REJECTION_REASON_LABELS, KITCHEN_REJECTION_REASONS, ORDER_STATUS_LABELS } from "@kanofood/core";
import type { KitchenRejectionReason, OrderStatus } from "@kanofood/core";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Select,
  Stack,
  Textarea,
  useToast,
} from "@kanofood/ui";

/**
 * What the kitchen may do to an order, and nothing it may not.
 *
 * The server sends the moves it will accept, so this offers exactly those and
 * the API re-checks every one: accepting is `CONFIRMED -> KITCHEN_ACCEPTED` and
 * nothing here can move an order to a rider, a delivery or a cancellation.
 *
 * A rejection requires a reason from a fixed list. The list is the decision made
 * on 2026-10-20 because PRODUCT_SPEC section 8 requires a reason and names none.
 * The note is optional on top of it, for the case the list cannot describe.
 *
 * `from` is the status the page was rendered with. The transition is conditional
 * on it, so a page left open while someone else acted gets a conflict rather than
 * overwriting them.
 */

export interface KitchenOrderActionsProps {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly actions: readonly OrderStatus[];
}

export function KitchenOrderActions({ orderId, status, actions }: KitchenOrderActionsProps) {
  const router = useRouter();
  const toast = useToast();

  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reasonCode, setReasonCode] = useState<KitchenRejectionReason>("ITEMS_UNAVAILABLE");
  const [note, setNote] = useState("");

  async function move(to: OrderStatus, extra: Record<string, unknown> = {}) {
    if (busy) return;
    setBusy(to);
    setError(null);

    try {
      const response = await fetch(`/api/v1/kitchen/orders/${orderId}/transition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from: status, to, ...extra }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: { message?: string } };

      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? "That did not go through.");
        setBusy(null);
        return;
      }

      toast?.push(`Order moved to ${ORDER_STATUS_LABELS[to]}.`);
      setBusy(null);
      setRejecting(false);
      setNote("");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check the connection and try again.");
      setBusy(null);
    }
  }

  if (actions.length === 0) {
    return (
      <Card>
        <CardHeader title="Actions" />
        <CardBody>
          <Alert tone="info">
            This order is {ORDER_STATUS_LABELS[status].toLowerCase()}. Nothing on it is yours to do;
            its history below is the record of how it got here.
          </Alert>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Actions" />
      <CardBody>
        <Stack>
          {error ? <Alert tone="danger">{error}</Alert> : null}

          {actions.includes("KITCHEN_ACCEPTED") ? (
            <Button
              type="button"
              variant="primary"
              block
              loading={busy === "KITCHEN_ACCEPTED"}
              disabled={busy !== null}
              onClick={() => void move("KITCHEN_ACCEPTED")}
            >
              Accept and start the order
            </Button>
          ) : null}

          {actions.includes("PREPARING") ? (
            <Button
              type="button"
              variant="primary"
              block
              loading={busy === "PREPARING"}
              disabled={busy !== null}
              onClick={() => void move("PREPARING")}
            >
              Start preparing
            </Button>
          ) : null}

          {actions.includes("READY_FOR_PICKUP") ? (
            <Button
              type="button"
              variant="primary"
              block
              loading={busy === "READY_FOR_PICKUP"}
              disabled={busy !== null}
              onClick={() => void move("READY_FOR_PICKUP")}
            >
              Mark ready for pickup
            </Button>
          ) : null}

          {actions.includes("KITCHEN_REJECTED") ? (
            rejecting ? (
              <Stack>
                <Field label="Why are you rejecting it?" htmlFor="reasonCode" required>
                  <Select
                    id="reasonCode"
                    name="reasonCode"
                    value={reasonCode}
                    onChange={(event) => setReasonCode(event.target.value as KitchenRejectionReason)}
                  >
                    {KITCHEN_REJECTION_REASONS.map((code) => (
                      <option key={code} value={code}>
                        {KITCHEN_REJECTION_REASON_LABELS[code]}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Anything else" htmlFor="note" hint="Optional. Kept on the order's history.">
                  <Textarea
                    id="note"
                    name="note"
                    rows={2}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="The rice ran out at 7pm and the customer asked for no substitutes."
                  />
                </Field>

                <Button
                  type="button"
                  variant="danger"
                  block
                  loading={busy === "KITCHEN_REJECTED"}
                  disabled={busy !== null}
                  onClick={() =>
                    void move("KITCHEN_REJECTED", {
                      reasonCode,
                      ...(note.trim() ? { note: note.trim() } : {}),
                    })
                  }
                >
                  Reject the order
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  block
                  disabled={busy !== null}
                  onClick={() => setRejecting(false)}
                >
                  Keep it
                </Button>
              </Stack>
            ) : (
              <Button
                type="button"
                variant="secondary"
                block
                disabled={busy !== null}
                onClick={() => setRejecting(true)}
              >
                Cannot take this order
              </Button>
            )
          ) : null}
        </Stack>
      </CardBody>
    </Card>
  );
}
