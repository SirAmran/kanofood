"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ORDER_STATUS_LABELS, requiresReason } from "@kanofood/core";
import type { OrderStatus } from "@kanofood/core";
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
 * What an admin can do to an order, and nothing it cannot.
 *
 * Screen 7.4. The destinations come from the transition table through the
 * server, so this form offers exactly the moves `canTransition` allows and no
 * others. It is not the thing that enforces them: the API route re-checks, and
 * the update behind that is conditional on the status the page was rendered
 * with. This just refuses to show a button that would fail.
 *
 * A reason field appears only when the domain requires one for the chosen
 * destination, which is `requiresReason` in `@kanofood/core`. Asking for a
 * reason on every move trains people to type "ok".
 */

interface RiderOption {
  readonly id: string;
  readonly name: string;
  readonly isAvailable: boolean;
}

export interface OrderActionsProps {
  readonly orderId: string;
  /** The status this page was rendered with. Sent as `from`, so a stale page conflicts. */
  readonly status: OrderStatus;
  readonly allowedNext: readonly OrderStatus[];
  readonly riders: readonly RiderOption[];
  readonly hasDelivery: boolean;
  /** Already assigned, so the rider block is hidden. */
  readonly riderName: string | null;
}

export function OrderActions({
  orderId,
  status,
  allowedNext,
  riders,
  hasDelivery,
  riderName,
}: OrderActionsProps) {
  const router = useRouter();
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [target, setTarget] = useState<OrderStatus | "">(allowedNext[0] ?? "");
  const [reason, setReason] = useState("");
  const [contactNote, setContactNote] = useState("");
  const [riderId, setRiderId] = useState("");

  const needsReason = target !== "" && requiresReason(target);
  const needsRider = target === "RIDER_ASSIGNED";
  const confirming = target === "CONFIRMED";

  async function post(path: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as { ok: boolean; error?: { message?: string } };

      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? "That did not go through.");
        setBusy(false);
        return false;
      }

      return true;
    } catch {
      setError("Could not reach the server. Check the connection and try again.");
      setBusy(false);
      return false;
    }
  }

  async function move(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || target === "") return;

    const ok = needsRider
      ? await post(`/api/v1/admin/orders/${orderId}/assign`, { riderId })
      : await post(`/api/v1/admin/orders/${orderId}/transition`, {
          from: status,
          to: target,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(contactNote.trim() ? { contactNote: contactNote.trim() } : {}),
        });

    if (!ok) return;

    toast?.push(`Order moved to ${ORDER_STATUS_LABELS[target]}.`);
    setBusy(false);
    setReason("");
    setContactNote("");
    router.refresh();
  }

  if (allowedNext.length === 0) {
    return (
      <Card>
        <CardHeader title="Actions" />
        <CardBody>
          <Alert tone="info">
            This order is {ORDER_STATUS_LABELS[status].toLowerCase()}. Nothing further can be done to
            it, and its history is the record of how it got here.
          </Alert>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Actions" />
      <CardBody>
        <form onSubmit={move} noValidate>
          <Stack>
            {error ? <Alert tone="danger">{error}</Alert> : null}

            <Field label="Move to" htmlFor="target" required>
              <Select
                name="target"
                value={target}
                onChange={(event) => setTarget(event.target.value as OrderStatus)}
              >
                {allowedNext.map((option) => (
                  <option key={option} value={option}>
                    {ORDER_STATUS_LABELS[option]}
                  </option>
                ))}
              </Select>
            </Field>

            {confirming ? (
              <Field
                label="Confirmation call"
                htmlFor="contactNote"
                hint="PRODUCT_SPEC section 9 requires a call before confirming. Record who was spoken to."
              >
                <Textarea
                  name="contactNote"
                  rows={2}
                  value={contactNote}
                  onChange={(event) => setContactNote(event.target.value)}
                  placeholder="Spoke to the customer, confirmed the address and the order."
                />
              </Field>
            ) : null}

            {needsRider ? (
              hasDelivery ? (
                <Alert tone="warning">
                  {riderName ?? "A rider"} is already on this order. Unassign is not built yet.
                </Alert>
              ) : riders.length === 0 ? (
                <Alert tone="danger">
                  No active rider to assign. Add one under Riders before assigning.
                </Alert>
              ) : (
                <Field label="Rider" htmlFor="riderId" required>
                  <Select
                    name="riderId"
                    value={riderId}
                    onChange={(event) => setRiderId(event.target.value)}
                    required
                  >
                    <option value="">Choose a rider</option>
                    {riders.map((rider) => (
                      <option key={rider.id} value={rider.id}>
                        {rider.name}
                        {rider.isAvailable ? "" : " (off shift)"}
                      </option>
                    ))}
                  </Select>
                </Field>
              )
            ) : null}

            {needsReason ? (
              <Field label="Reason" htmlFor="reason" required>
                <Textarea
                  name="reason"
                  rows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                />
              </Field>
            ) : (
              <Field label="Note" htmlFor="reason" hint="Optional. Kept against this event.">
                <Textarea
                  name="reason"
                  rows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            )}

            <Button
              type="submit"
              variant={target === "ADMIN_CANCELLED" || target === "DELIVERY_FAILED" ? "danger" : "primary"}
              block
              loading={busy}
              disabled={(needsRider && riderId === "") || (needsReason && reason.trim() === "")}
            >
              {target === "" ? "Choose a move" : ORDER_STATUS_LABELS[target]}
            </Button>
          </Stack>
        </form>
      </CardBody>
    </Card>
  );
}
