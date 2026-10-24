import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ORDER_STATUS_LABELS, formatNaira } from "@kanofood/core";
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  Cluster,
  Grid,
  Money,
  PageHeader,
  Spread,
  Stack,
  StatusPill,
  Table,
  TableWrap,
  Td,
  Th,
} from "@kanofood/ui";

import { formatDateTime, toneForStatus } from "@/lib/admin/status";
import { loadRiderDelivery } from "@/lib/rider/deliveries";
import { requireRider } from "@/lib/rider/session";
import { CashForm } from "../_components/cash-form";
import { DeliveryActions } from "../_components/delivery-actions";

/**
 * One delivery in full. Screen 6.3 in docs/UX_SPEC.md.
 *
 * Ordered by what a rider does with it: what to collect, then the one action,
 * then where it goes. The order contents are high up because a rider checks the
 * bag against them at the door, and "both addresses and both phone numbers" means
 * the kitchen's as well as the customer's: when the gate is shut, the kitchen's
 * number is the one that answers.
 *
 * Loaded through a rider-scoped query, so another rider's order id in the address
 * is a 404 rather than a leak of somebody else's customer.
 */

export const metadata: Metadata = { title: "Delivery" };

export const dynamic = "force-dynamic";

const CASH_STATUSES = new Set(["RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"]);

export default async function RiderDeliveryPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const actor = await requireRider();
  const { orderId } = await params;

  const delivery = await loadRiderDelivery({ riderId: actor.riderId, orderId });
  if (!delivery) notFound();

  const live = CASH_STATUSES.has(delivery.status);
  const showCash =
    delivery.paymentMethod === "cod" &&
    live &&
    !delivery.reconciled &&
    delivery.totalKobo > 0n;

  const customerDirections = mapLink(
    `${delivery.deliveryAddress.addressText}${
      delivery.deliveryAddress.landmark ? `, ${delivery.deliveryAddress.landmark}` : ""
    }`,
  );
  const kitchenDirections = mapLink(delivery.kitchen.address ?? delivery.kitchen.name);

  return (
    <Stack>
      <PageHeader
        title={delivery.orderNumber}
        sub={
          <Cluster>
            <span className="kf-muted">{delivery.kitchen.name}</span>
            <Link href="/rider">Back to today</Link>
          </Cluster>
        }
        action={
          <StatusPill tone={toneForStatus(delivery.status)} label={ORDER_STATUS_LABELS[delivery.status]} />
        }
      />

      {!actor.isActive ? (
        <Alert tone="danger">
          Your rider account is deactivated. This delivery can be read but nothing can be recorded
          against it.
        </Alert>
      ) : null}

      {delivery.failureReason ? (
        <Alert tone="danger">
          Reported as failed: {delivery.failureReason}. The office is following it up.
        </Alert>
      ) : null}

      {delivery.amountToCollectKobo > 0n ? (
        <Card>
          <CardBody>
            <div style={{ fontSize: "15px", fontWeight: 600 }}>Collect at the door</div>
            <div style={{ fontSize: "34px", fontWeight: 700, lineHeight: 1.1, margin: "4px 0" }}>
              <Money value={formatNaira(delivery.amountToCollectKobo)} />
            </div>
            <div className="kf-muted">
              {delivery.paymentMethod === "cod"
                ? "Cash on delivery."
                : "Paid already. Nothing to collect."}
            </div>
          </CardBody>
        </Card>
      ) : (
        <Alert tone="info">
          {delivery.collectedKobo > 0n
            ? `Collected ${formatNaira(delivery.collectedKobo)}. ${
                delivery.reconciled
                  ? "The office has counted it."
                  : "Nothing left to collect at the door."
              }`
            : "This order was paid before you picked it up. Nothing to collect."}
        </Alert>
      )}

      <Grid>
        <Stack>
          <Card>
            <CardHeader
              title="In the bag"
              action={
                <span className="kf-muted">
                  {delivery.items.reduce((total, item) => total + item.quantity, 0)} items
                </span>
              }
            />
            <CardBody flush>
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Qty</Th>
                      <Th>Dish</Th>
                      <Th numeric>Line</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {delivery.items.map((item) => (
                      <tr key={item.id}>
                        <Td label="Qty">
                          <span className="kf-numeric">{item.quantity}</span>
                        </Td>
                        <Td label="Dish">
                          <strong>{item.name}</strong>
                          {item.notes ? <div className="kf-list__meta">{item.notes}</div> : null}
                        </Td>
                        <Td numeric label="Line">
                          <Money value={formatNaira(item.lineTotalKobo)} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </CardBody>
            <CardBody>
              <Stack tight>
                <Spread>
                  <span className="kf-muted">Food</span>
                  <Money value={formatNaira(delivery.subtotalKobo)} />
                </Spread>
                <Spread>
                  <span className="kf-muted">Delivery</span>
                  <Money value={formatNaira(delivery.deliveryFeeKobo)} />
                </Spread>
                <div className="kf-price-row kf-price-row--total">
                  <span className="kf-price-row__label">Order total</span>
                  <Money value={formatNaira(delivery.totalKobo)} />
                </div>
                <Spread>
                  <span className="kf-muted">Payment</span>
                  <span>{delivery.paymentMethod.toUpperCase()}</span>
                </Spread>
              </Stack>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Where it goes" />
            <CardBody>
              <Stack tight>
                <div>
                  <div className="kf-muted">Customer</div>
                  <div style={{ fontWeight: 600 }}>{delivery.customer.name}</div>
                  <div>
                    <a href={`tel:${delivery.customer.phone}`} style={{ fontSize: "18px" }}>
                      {delivery.customer.phone}
                    </a>
                  </div>
                </div>
                <div>
                  <div className="kf-muted">Address</div>
                  <div>{delivery.deliveryAddress.addressText || "Not given"}</div>
                  {delivery.deliveryAddress.landmark ? (
                    <div className="kf-list__meta">{delivery.deliveryAddress.landmark}</div>
                  ) : null}
                </div>
                {delivery.deliveryAddress.instructions ? (
                  <div>
                    <div className="kf-muted">Finding it</div>
                    <div>{delivery.deliveryAddress.instructions}</div>
                  </div>
                ) : null}
                {customerDirections ? (
                  <a
                    href={customerDirections}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "16px" }}
                  >
                    Navigate to the customer
                  </a>
                ) : null}
              </Stack>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Where it comes from" />
            <CardBody>
              <Stack tight>
                <div>
                  <div className="kf-muted">Kitchen</div>
                  <div style={{ fontWeight: 600 }}>{delivery.kitchen.name}</div>
                  {delivery.kitchen.phone ? (
                    <a href={`tel:${delivery.kitchen.phone}`} style={{ fontSize: "18px" }}>
                      {delivery.kitchen.phone}
                    </a>
                  ) : (
                    <div className="kf-muted">No phone number on file.</div>
                  )}
                </div>
                <div>
                  <div className="kf-muted">Address</div>
                  <div>{delivery.kitchen.address || "Not given"}</div>
                  {delivery.kitchenAddress.landmark ? (
                    <div className="kf-list__meta">{delivery.kitchenAddress.landmark}</div>
                  ) : null}
                </div>
                {kitchenDirections ? (
                  <a
                    href={kitchenDirections}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "16px" }}
                  >
                    Navigate to the kitchen
                  </a>
                ) : null}
              </Stack>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="History" />
            <CardBody>
              <Stack tight>
                {delivery.events.map((event) => (
                  <Spread key={event.id}>
                    <span>
                      <strong>{ORDER_STATUS_LABELS[event.toStatus]}</strong>
                      {event.fromStatus ? (
                        <span className="kf-muted"> from {ORDER_STATUS_LABELS[event.fromStatus]}</span>
                      ) : null}
                    </span>
                    <span className="kf-muted">{formatDateTime(event.createdAt)}</span>
                  </Spread>
                ))}
              </Stack>
            </CardBody>
          </Card>
        </Stack>

        <Stack>
          <Card>
            <CardHeader title="What to do" />
            <CardBody>
              <Stack>
                {delivery.actions.length === 0 ? (
                  <Alert tone="info">
                    This delivery is {ORDER_STATUS_LABELS[delivery.status].toLowerCase()}. Nothing on
                    it is yours to do.
                  </Alert>
                ) : (
                  <DeliveryActions
                    orderId={delivery.orderId}
                    orderNumber={delivery.orderNumber}
                    status={delivery.status}
                    actions={delivery.actions}
                    size="md"
                  />
                )}

                {delivery.deliveryNotes ? (
                  <Alert tone="info">Note from the customer: {delivery.deliveryNotes}</Alert>
                ) : null}
              </Stack>
            </CardBody>
          </Card>

          {showCash ? (
            <Card>
              <CardHeader title="Cash collected" />
              <CardBody>
                <CashForm
                  orderId={delivery.orderId}
                  orderNumber={delivery.orderNumber}
                  expectedKobo={delivery.totalKobo}
                />
              </CardBody>
            </Card>
          ) : null}
        </Stack>
      </Grid>
    </Stack>
  );
}

/** A Google Maps search link, or null when there is nothing to search for. */
function mapLink(query: string): string | null {
  const trimmed = query.trim();
  if (trimmed === "") return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}
