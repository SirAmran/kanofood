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

import { KitchenOrderActions } from "@/app/(kitchen)/_components/kitchen-order-actions";
import { formatDateTime, toneForStatus } from "@/lib/admin/status";
import { loadKitchenOrder } from "@/lib/kitchen/orders";
import { requireKitchen } from "@/lib/kitchen/session";

/**
 * One order, in full. Screen 5.4 in docs/UX_SPEC.md.
 *
 * This is the screen the kitchen actually cooks from, so the items, quantities
 * and per-line notes come first and are large. The delivery address is next,
 * because whoever is packing needs to know which bag goes where. History is last:
 * it answers "who rejected this and why" after the fact, not during service.
 *
 * The order is loaded through a kitchen-scoped query, so another kitchen's id in
 * the address is a 404 rather than a leak of its contents.
 */

export const metadata: Metadata = { title: "Order" };

export const dynamic = "force-dynamic";

export default async function KitchenOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireKitchen();
  const { id } = await params;

  const order = await loadKitchenOrder({ kitchenId: actor.kitchenId, orderId: id });
  if (!order) notFound();

  return (
    <Stack>
      <PageHeader
        title={order.orderNumber}
        sub={
          <Cluster>
            <span className="kf-muted">{formatDateTime(order.placedAt)}</span>
            <span className="kf-muted">{order.customer.name}</span>
            <Link href="/kitchen/orders">Back to the queue</Link>
          </Cluster>
        }
        action={
          <StatusPill tone={toneForStatus(order.status)} label={ORDER_STATUS_LABELS[order.status]} />
        }
      />

      {!actor.kitchenIsActive ? (
        <Alert tone="danger">
          This kitchen is suspended. The order can be read but not moved.
        </Alert>
      ) : null}

      <Grid>
        <Stack>
          <Card>
            <CardHeader
              title="The order"
              action={
                <span className="kf-muted">
                  {order.items.reduce((total, item) => total + item.quantity, 0)} items
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
                    {order.items.map((item) => (
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
                  <Money value={formatNaira(order.subtotalKobo)} />
                </Spread>
                <Spread>
                  <span className="kf-muted">Delivery (paid to the platform)</span>
                  <Money value={formatNaira(order.deliveryFeeKobo)} />
                </Spread>
                <div className="kf-price-row kf-price-row--total">
                  <span className="kf-price-row__label">Total</span>
                  <Money value={formatNaira(order.totalKobo)} />
                </div>
                <p className="kf-muted">
                  Your sales figure counts the food only, never the delivery fee.
                </p>
              </Stack>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="History" />
            <CardBody>
              <Stack tight>
                {order.events.map((event) => (
                  <div key={event.id}>
                    <Spread>
                      <span>
                        <strong>{ORDER_STATUS_LABELS[event.toStatus]}</strong>
                        {event.fromStatus ? (
                          <span className="kf-muted">
                            {" "}
                            from {ORDER_STATUS_LABELS[event.fromStatus]}
                          </span>
                        ) : null}
                      </span>
                      <span className="kf-muted">{formatDateTime(event.createdAt)}</span>
                    </Spread>
                    <div className="kf-list__meta">
                      {event.actorName ?? "System"}
                      {event.actorRole ? ` (${event.actorRole})` : ""}
                      {event.reason ? ` - ${event.reason}` : ""}
                    </div>
                  </div>
                ))}
              </Stack>
            </CardBody>
          </Card>
        </Stack>

        <Stack>
          <KitchenOrderActions
            orderId={order.id}
            status={order.status}
            actions={order.actions}
          />

          <Card>
            <CardHeader title="Delivery" />
            <CardBody>
              <Stack tight>
                <Spread>
                  <span className="kf-muted">Customer</span>
                  <a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a>
                </Spread>
                {order.address.label ? (
                  <Spread>
                    <span className="kf-muted">Address name</span>
                    <span>{order.address.label}</span>
                  </Spread>
                ) : null}
                <div>
                  <div className="kf-muted">Address</div>
                  <div>{order.address.addressText || "Not given"}</div>
                </div>
                {order.address.landmark ? (
                  <div>
                    <div className="kf-muted">Landmark</div>
                    <div>{order.address.landmark}</div>
                  </div>
                ) : null}
                {order.address.instructions ? (
                  <div>
                    <div className="kf-muted">Finding it</div>
                    <div>{order.address.instructions}</div>
                  </div>
                ) : null}
                {order.deliveryNotes ? (
                  <Alert tone="info">{order.deliveryNotes}</Alert>
                ) : null}
                {order.riderName ? (
                  <Spread>
                    <span className="kf-muted">Rider</span>
                    <span>{order.riderName}</span>
                  </Spread>
                ) : null}
                <Spread>
                  <span className="kf-muted">Payment</span>
                  <span>{order.paymentMethod.toUpperCase()}</span>
                </Spread>
              </Stack>
            </CardBody>
          </Card>
        </Stack>
      </Grid>
    </Stack>
  );
}
