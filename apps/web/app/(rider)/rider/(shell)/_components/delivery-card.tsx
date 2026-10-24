"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatNaira } from "@kanofood/core";
import { Alert, Badge, Button, Card, CardBody, Money, Stack, buttonClass, useToast } from "@kanofood/ui";

import type { RiderDeliveryRow } from "@/lib/rider/deliveries";
import { DeliveryActions } from "./delivery-actions";

/**
 * One delivery, as the rider sees it. Screen 6.2.
 *
 * Every card answers "what do I do next" before it shows anything else: the one
 * primary button is the next step, and everything above it is what the rider
 * needs to reach the door. Tap-to-call and tap-to-navigate are links, not text,
 * because a rider pressing a phone number expects the phone to dial.
 *
 * A cancelled order stays on the list, marked, with a single "clear" action.
 * A rider already riding to an address the platform cancelled under them needs
 * to see that rather than an empty screen.
 */

export interface DeliveryCardProps {
  readonly row: RiderDeliveryRow;
}

export function DeliveryCard({ row }: DeliveryCardProps) {
  const router = useRouter();
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelled = row.status === "CUSTOMER_CANCELLED" || row.status === "ADMIN_CANCELLED";
  const failed = row.status === "DELIVERY_FAILED";
  const delivered = row.status === "DELIVERED";

  async function clear() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/rider/deliveries/${row.orderId}/acknowledge`, {
        method: "POST",
      });
      const payload = (await response.json()) as { ok: boolean; error?: { message?: string } };
      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? "That did not go through.");
        setBusy(false);
        return;
      }
      toast?.push(`Order ${row.orderNumber} cleared.`);
      setBusy(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check the connection and try again.");
      setBusy(false);
    }
  }

  const done = delivered || failed || cancelled || row.canAcknowledge;

  return (
    <Card>
      <CardBody>
        <Stack>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "var(--space-2)",
              flexWrap: "wrap",
            }}
          >
            <Link
              href={`/rider/${row.orderId}`}
              style={{ fontSize: "18px", fontWeight: 600, textDecoration: "none" }}
            >
              {row.orderNumber}
            </Link>
            <Badge tone={cancelled || failed ? "danger" : delivered ? "success" : "accent"}>
              {labelFor(row.status)}
            </Badge>
          </div>

          <div>
            <div style={{ fontWeight: 600 }}>{row.kitchenName}</div>
            <div className="kf-muted">{row.deliveryArea}</div>
            {row.landmark && row.addressText !== row.landmark ? (
              <div className="kf-muted">{row.addressText}</div>
            ) : null}
            <div className="kf-muted">For {row.customerName}</div>
          </div>

          {row.amountToCollectKobo > 0n ? (
            <div style={{ fontSize: "26px", fontWeight: 700, lineHeight: 1.1 }}>
              Collect <Money value={formatNaira(row.amountToCollectKobo)} />
            </div>
          ) : (
            <div className="kf-muted">Nothing to collect, this order was paid already.</div>
          )}

          {row.failureReason ? (
            <Alert tone="danger">Reported as failed: {row.failureReason}</Alert>
          ) : null}

          {cancelled ? (
            <Alert tone="danger">
              This order was cancelled while it was on your list. Nothing left to deliver.
            </Alert>
          ) : null}

          {error ? <Alert tone="danger">{error}</Alert> : null}

          <div style={{ display: "grid", gap: "var(--space-2)", gridTemplateColumns: "1fr 1fr" }}>
            <a
              href={`tel:${row.customerPhone}`}
              className={buttonClass({ variant: "secondary", size: "lg", block: true })}
              style={{ minHeight: "52px" }}
            >
              Call customer
            </a>
            {row.landmark || row.addressText ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${row.addressText}${row.landmark ? `, ${row.landmark}` : ""}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass({ variant: "secondary", size: "lg", block: true })}
                style={{ minHeight: "52px" }}
              >
                Navigate
              </a>
            ) : null}
          </div>

          <DeliveryActions
            orderId={row.orderId}
            orderNumber={row.orderNumber}
            status={row.status}
            actions={row.nextAction ? [row.nextAction] : []}
          />

          {row.canAcknowledge ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              block
              loading={busy}
              disabled={busy}
              onClick={() => void clear()}
            >
              Clear from my list
            </Button>
          ) : null}

          {done ? null : (
            <Link href={`/rider/${row.orderId}`} style={{ fontSize: "14px" }}>
              Open full details
            </Link>
          )}
        </Stack>
      </CardBody>
    </Card>
  );
}

function labelFor(status: RiderDeliveryRow["status"]): string {
  switch (status) {
    case "DELIVERED":
      return "Delivered";
    case "DELIVERY_FAILED":
      return "Failed";
    case "CUSTOMER_CANCELLED":
      return "Cancelled";
    case "ADMIN_CANCELLED":
      return "Cancelled";
    case "RIDER_ASSIGNED":
      return "To collect";
    case "PICKED_UP":
      return "Carrying";
    case "OUT_FOR_DELIVERY":
      return "Out for delivery";
    default:
      return status;
  }
}
