import type { Metadata } from "next";
import Link from "next/link";

import { formatNaira } from "@kanofood/core";
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  Cluster,
  EmptyState,
  Metric,
  MetricGrid,
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

import { loadDashboard } from "@/lib/admin/dashboard";
import { requireAdmin } from "@/lib/admin/session";
import { elapsedSince, formatDateTime } from "@/lib/admin/status";

/**
 * Admin dashboard. Screen 7.2 in docs/UX_SPEC.md.
 *
 * The confirmation queue is first, above the counters, and that ordering is the
 * whole point of the screen. PRODUCT_SPEC section 9 requires a human to
 * telephone the customer before an order is confirmed, so an order sitting in
 * PENDING_CONFIRMATION is a customer waiting on a call. It is the only tile on
 * this page that represents work nobody has started, so it is the only one above
 * the fold.
 *
 * Everything else is a reading of the current state, and every number here is
 * derived at read time from the rows themselves. Nothing on this page can drift
 * from the database.
 */

export const metadata: Metadata = { title: "Dashboard" };

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireAdmin();
  const data = await loadDashboard();

  const { counts, cash, network } = data;

  return (
    <Stack>
      <PageHeader
        title="Dashboard"
        sub={`As at ${formatDateTime(data.generatedAt)}`}
        action={
          <Link href="/admin/orders?status=PENDING_CONFIRMATION" className="kf-btn kf-btn--secondary">
            Open the queue
          </Link>
        }
      />

      <Card>
        <CardHeader
          title="Waiting for a call"
          action={
            counts.awaitingConfirmation > 0 ? (
              <StatusPill tone="warning" label={`${String(counts.awaitingConfirmation)} waiting`} live />
            ) : null
          }
        />
        <CardBody flush>
          {data.queue.length === 0 ? (
            <EmptyState title="Nothing waiting">
              Every order has been confirmed or dealt with. This is the state the queue is meant to
              reach.
            </EmptyState>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Customer</Th>
                    <Th>Kitchen</Th>
                    <Th>Waiting</Th>
                    <Th numeric>Total</Th>
                    <Th>
                      <span className="kf-visually-hidden">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {data.queue.map((row) => (
                    <tr key={row.id}>
                      <Td label="Order">
                        <Link href={`/admin/orders/${row.id}`} className="kf-list__title">
                          {row.orderNumber}
                        </Link>
                        <div className="kf-list__meta">
                          {row.itemCount === 1 ? "1 item" : `${String(row.itemCount)} items`}
                        </div>
                      </Td>
                      <Td label="Customer">
                        {row.customerName}
                        <div className="kf-list__meta">{row.customerPhone}</div>
                      </Td>
                      <Td label="Kitchen" muted>
                        {row.kitchenName}
                      </Td>
                      <Td label="Waiting">
                        {/* The number is the point: it is how the longest wait
                            is spotted without reading every row. */}
                        <span className="kf-numeric">{elapsedSince(row.placedAt)}</span>
                      </Td>
                      <Td numeric label="Total">
                        <Money value={formatNaira(row.totalKobo)} />
                      </Td>
                      <Td label="Actions">
                        {/* A telephone link, so the call the process requires is
                            one tap from the row that needs it. */}
                        <a href={`tel:${row.customerPhone}`} className="kf-btn kf-btn--secondary kf-btn--sm">
                          Call
                        </a>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </CardBody>
      </Card>

      <MetricGrid>
        <Metric
          label="Live orders"
          value={String(counts.live)}
          foot="Still moving, not yet finished"
        />
        <Metric
          label="Placed today"
          value={String(counts.placedToday)}
          foot="Since midnight in Kano"
        />
        <Metric
          label="Delivered today"
          value={String(counts.deliveredToday)}
          foot="Completed deliveries"
        />
        <Metric
          label="Ended badly today"
          value={String(counts.cancelledToday + counts.failedToday)}
          foot={`${String(counts.cancelledToday)} cancelled, ${String(counts.failedToday)} failed`}
          attention={counts.failedToday > 0}
        />
        <Metric
          label="Gross today"
          value={formatNaira(data.grossTodayKobo)}
          foot="Order value as placed"
        />
        <Metric
          label="Collected today"
          value={formatNaira(data.collectedTodayKobo)}
          foot="Marked collected by a rider"
        />
      </MetricGrid>

      <div className="kf-grid kf-grid--wide">
        <Card>
          <CardHeader
            title="Cash outstanding"
            action={
              <Link href="/admin/cash" className="kf-btn kf-btn--ghost kf-btn--sm">
                Reconcile
              </Link>
            }
          />
          <CardBody>
            <Stack tight>
              <Spread>
                <span className="kf-muted">Held by riders</span>
                <Money value={formatNaira(cash.heldByRidersKobo)} />
              </Spread>
              <Spread>
                <span className="kf-muted">Handed over, not counted</span>
                <Money value={formatNaira(cash.awaitingCountKobo)} />
              </Spread>
              <div className="kf-price-row kf-price-row--total">
                <span className="kf-price-row__label">Outstanding</span>
                <Money value={formatNaira(cash.outstandingKobo)} />
              </div>

              {cash.outstandingKobo > 0n ? (
                <Alert tone={cash.ridersHoldingCash > 0 ? "warning" : "info"}>
                  {cash.ridersHoldingCash === 1
                    ? "1 rider is holding platform cash."
                    : `${String(cash.ridersHoldingCash)} riders are holding platform cash.`}
                </Alert>
              ) : (
                <Alert tone="success">Every rider is square.</Alert>
              )}
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Network"
            action={
              <Cluster>
                <Link href="/admin/kitchens" className="kf-btn kf-btn--ghost kf-btn--sm">
                  Kitchens
                </Link>
                <Link href="/admin/riders" className="kf-btn kf-btn--ghost kf-btn--sm">
                  Riders
                </Link>
              </Cluster>
            }
          />
          <CardBody>
            <Stack tight>
              <Spread>
                <span className="kf-muted">Kitchens open</span>
                <span className="kf-numeric">
                  {network.kitchensOpen} of {network.kitchensTotal}
                </span>
              </Spread>
              <Spread>
                <span className="kf-muted">Riders available</span>
                <span className="kf-numeric">
                  {network.ridersAvailable} of {network.ridersTotal}
                </span>
              </Spread>
              <Spread>
                <span className="kf-muted">Deliveries in flight</span>
                <span className="kf-numeric">{network.ridersBusy}</span>
              </Spread>

              {/* Stated in terms an operator can act on, not as a ratio. */}
              {network.kitchensOpen === 0 && network.kitchensTotal > 0 ? (
                <Alert tone="danger">
                  No kitchen is open. Customers cannot order anything right now.
                </Alert>
              ) : null}
              {network.ridersAvailable === 0 && network.ridersTotal > 0 ? (
                <Alert tone="warning">
                  No rider is marked available. New orders will have nobody to assign.
                </Alert>
              ) : null}
            </Stack>
          </CardBody>
        </Card>
      </div>
    </Stack>
  );
}
