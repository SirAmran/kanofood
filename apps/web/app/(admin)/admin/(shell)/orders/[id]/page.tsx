import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ACTIVE_STATUSES, formatNaira } from "@kanofood/core";
import {
  Alert,
  Avatar,
  Card,
  CardBody,
  CardHeader,
  Cluster,
  DescriptionList,
  EmptyState,
  Grid,
  Money,
  PageHeader,
  PriceRow,
  Spread,
  Stack,
  StatusPill,
  Table,
  TableWrap,
  Td,
  Th,
  Timeline,
} from "@kanofood/ui";
import type { DescriptionItem, TimelineEntry } from "@kanofood/ui";
import type { Tone } from "@kanofood/ui";

import { OrderActions } from "@/app/(admin)/_components/order-actions";
import { adminChoices, loadOrder } from "@/lib/admin/orders";
import { listAssignableRiders } from "@/lib/admin/network";
import { requireAdmin } from "@/lib/admin/session";
import {
  elapsedSince,
  formatDateTime,
  labelForStatus,
  toneForStatus,
} from "@/lib/admin/status";

/**
 * Order detail. Screen 7.4 in docs/UX_SPEC.md.
 *
 * The whole order on one page: what was ordered, what it costs, who is carrying
 * it, where it is going, and every event that moved it. ARCHITECTURE section 5
 * makes `order_events` the record and `orders.status` a cache of it, so the
 * timeline is not a decoration on this page, it is the primary evidence of what
 * happened. The actions sit above it because acting is why an operator opened
 * the page.
 */

export const metadata: Metadata = { title: "Order" };

export const dynamic = "force-dynamic";

/**
 * The address the order was placed against.
 *
 * `address_snapshot` is a JSON column, so its contents are whatever was written
 * at placement and nothing type-checks them at read time. Everything is read
 * defensively, and a snapshot in a shape this does not recognise degrades to
 * showing nothing rather than throwing on a page an operator needs.
 */
function readAddress(snapshot: unknown): { addressText: string | null; landmark: string | null } {
  if (snapshot === null || typeof snapshot !== "object") {
    return { addressText: null, landmark: null };
  }

  const record = snapshot as Record<string, unknown>;
  const text = typeof record.addressText === "string" ? record.addressText : null;
  const landmark = typeof record.landmark === "string" ? record.landmark : null;

  return { addressText: text, landmark };
}

const PAYMENT_TONES: Readonly<Record<string, Tone>> = {
  pending: "warning",
  collected: "success",
  reconciled: "success",
  failed: "danger",
};

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const order = await loadOrder(id);
  if (!order) notFound();

  const riders = order.delivery ? [] : await listAssignableRiders();
  const address = readAddress(order.addressSnapshot);
  const live = ACTIVE_STATUSES.includes(order.status);
  const choices = adminChoices(order.status);
  // Aliased once so the narrowing from the null check below survives into the
  // JSX, where a property access on `order` would not be narrowed reliably.
  const delivery = order.delivery;

  const facts: DescriptionItem[] = [
    { term: "Customer", value: order.customer.name },
    {
      term: "Phone",
      value: (
        <a href={`tel:${order.customer.phone}`} className="kf-link">
          {order.customer.phone}
        </a>
      ),
    },
    { term: "Kitchen", value: <Link href={`/admin/kitchens/${order.kitchen.id}`}>{order.kitchen.name}</Link> },
    { term: "Placed", value: <span className="kf-numeric">{formatDateTime(order.placedAt)}</span> },
    { term: "Payment", value: order.paymentMethod === "cod" ? "Cash on delivery" : "Paid online" },
  ];

  if (address.addressText) facts.push({ term: "Address", value: address.addressText });
  if (address.landmark) facts.push({ term: "Landmark", value: address.landmark });
  if (order.deliveryNotes) facts.push({ term: "Delivery note", value: order.deliveryNotes });

  const history: TimelineEntry[] = order.events.map((event, index) => ({
    id: event.id,
    title:
      event.fromStatus === null ? (
        <>Placed</>
      ) : (
        <>
          {labelForStatus(event.fromStatus)} to {labelForStatus(event.toStatus)}
        </>
      ),
    time: <span className="kf-numeric">{formatDateTime(event.createdAt)}</span>,
    body: (
      <Cluster>
        <span className="kf-muted">
          {event.actorName ?? (event.actorRole === "system" ? "System" : "Unknown")}
          {event.actorRole ? ` - ${event.actorRole}` : ""}
        </span>
        {event.reason ? <span>{event.reason}</span> : null}
      </Cluster>
    ),
    current: index === order.events.length - 1,
  }));

  return (
    <Stack>
      <PageHeader
        title={
          <Cluster>
            <span>{order.orderNumber}</span>
            <StatusPill tone={toneForStatus(order.status)} label={labelForStatus(order.status)} live={live} />
          </Cluster>
        }
        sub={
          live
            ? `Placed ${formatDateTime(order.placedAt)}, ${elapsedSince(order.placedAt)} ago`
            : `Placed ${formatDateTime(order.placedAt)}`
        }
        action={
          <Cluster>
            <a href={`tel:${order.customer.phone}`} className="kf-btn kf-btn--secondary">
              Call customer
            </a>
            <Link href="/admin/orders" className="kf-btn kf-btn--ghost">
              All orders
            </Link>
          </Cluster>
        }
      />

      <Grid wide>
        <Stack>
          <Card>
            <CardHeader
              title="Items"
              action={
                <span className="kf-muted">
                  {order.items.length === 1 ? "1 item" : `${String(order.items.length)} items`}
                </span>
              }
            />
            <CardBody flush>
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Item</Th>
                      <Th numeric>Qty</Th>
                      <Th numeric>Unit</Th>
                      <Th numeric>Line</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.id}>
                        <Td label="Item">
                          {item.name}
                          {item.notes ? <div className="kf-list__meta">{item.notes}</div> : null}
                          {/* The line survives the menu item being deleted, which
                              is why the schema snapshots the name and the price.
                              Saying so here stops it reading as a bug. */}
                          {item.menuItemExists ? null : (
                            <div className="kf-list__meta">No longer on the menu</div>
                          )}
                        </Td>
                        <Td numeric label="Qty">
                          {item.quantity}
                        </Td>
                        <Td numeric label="Unit">
                          <Money value={formatNaira(item.unitPriceKobo)} />
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
                <PriceRow label="Subtotal" value={formatNaira(order.subtotalKobo)} />
                <PriceRow label="Delivery" value={formatNaira(order.deliveryFeeKobo)} />
                {order.discountKobo > 0n ? (
                  <PriceRow
                    label="Discount"
                    value={formatNaira(order.discountKobo)}
                    negative
                  />
                ) : null}
                <PriceRow label="Total" value={formatNaira(order.totalKobo)} total />
              </Stack>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Payments" />
            <CardBody flush>
              {order.payments.length === 0 ? (
                <EmptyState title="No payment recorded">
                  Nothing has been collected against this order yet.
                </EmptyState>
              ) : (
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Method</Th>
                        <Th>Status</Th>
                        <Th numeric>Amount</Th>
                        <Th>When</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.payments.map((payment) => (
                        <tr key={payment.id}>
                          <Td label="Method" muted>
                            {payment.method === "cod" ? "Cash on delivery" : payment.method}
                          </Td>
                          <Td label="Status">
                            <StatusPill
                              tone={PAYMENT_TONES[payment.status] ?? "neutral"}
                              label={payment.status}
                            />
                          </Td>
                          <Td numeric label="Amount">
                            <Money value={formatNaira(payment.amountKobo)} />
                          </Td>
                          <Td label="When">
                            <span className="kf-numeric">
                              {payment.reconciledAt
                                ? `Reconciled ${formatDateTime(payment.reconciledAt)}`
                                : payment.collectedAt
                                  ? `Collected ${formatDateTime(payment.collectedAt)}`
                                  : "Not yet"}
                            </span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Delivery" />
            <CardBody>
              {delivery === null ? (
                <EmptyState title="No rider yet">
                  {choices.includes("RIDER_ASSIGNED")
                    ? "Assign one from the actions panel."
                    : "A rider can be assigned once the kitchen has the order ready."}
                </EmptyState>
              ) : (
                <Stack tight>
                  <Spread>
                    <span className="kf-cluster">
                      <Avatar name={delivery.riderName} />
                      <span>
                        <Link href={`/admin/riders/${delivery.riderId}`} className="kf-list__title">
                          {delivery.riderName}
                        </Link>
                        <div className="kf-list__meta">{delivery.riderPhone}</div>
                      </span>
                    </span>
                    <a href={`tel:${delivery.riderPhone}`} className="kf-btn kf-btn--secondary kf-btn--sm">
                      Call
                    </a>
                  </Spread>

                  <DescriptionList
                    items={[
                      {
                        term: "Assigned",
                        value: <span className="kf-numeric">{formatDateTime(delivery.assignedAt)}</span>,
                      },
                      {
                        term: "Picked up",
                        value: delivery.pickedUpAt ? (
                          <span className="kf-numeric">{formatDateTime(delivery.pickedUpAt)}</span>
                        ) : (
                          <span className="kf-muted">Not yet</span>
                        ),
                      },
                      {
                        term: "Delivered",
                        value: delivery.deliveredAt ? (
                          <span className="kf-numeric">{formatDateTime(delivery.deliveredAt)}</span>
                        ) : (
                          <span className="kf-muted">Not yet</span>
                        ),
                      },
                    ]}
                  />

                  {delivery.failedAt ? (
                    <Alert tone="danger" title="Delivery failed">
                      {delivery.failureReason ??
                        `Recorded ${formatDateTime(delivery.failedAt)} with no reason given.`}
                    </Alert>
                  ) : null}
                </Stack>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <CardBody>
              <DescriptionList items={facts} />
            </CardBody>
          </Card>
        </Stack>

        <Stack>
          <OrderActions
            orderId={order.id}
            status={order.status}
            allowedNext={choices}
            riders={riders.map((rider) => ({
              id: rider.id,
              name: rider.name,
              isAvailable: rider.isAvailable,
            }))}
            hasDelivery={delivery !== null}
            riderName={delivery?.riderName ?? null}
          />

          <Card>
            <CardHeader title="History" />
            <CardBody>
              {history.length === 0 ? (
                <EmptyState title="No events">
                  This order has no recorded history. That should not be possible.
                </EmptyState>
              ) : (
                <Timeline items={history} />
              )}
            </CardBody>
          </Card>
        </Stack>
      </Grid>
    </Stack>
  );
}
