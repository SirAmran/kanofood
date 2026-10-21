import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatNaira } from "@kanofood/core";
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Metric,
  MetricGrid,
  Money,
  PageHeader,
  Stack,
  Table,
  TableWrap,
  Td,
  Th,
} from "@kanofood/ui";

import { AdminToggle } from "@/app/(admin)/_components/admin-toggle";
import { loadKitchenDashboard } from "@/lib/kitchen/dashboard";
import { requireKitchen } from "@/lib/kitchen/session";
import { elapsedSince, formatDateTime } from "@/lib/admin/status";

/**
 * The kitchen dashboard. Screen 5.2 in docs/UX_SPEC.md.
 *
 * The open switch is the first control, because it is the one thing on this
 * screen that changes whether the kitchen is trading at all. The unaccepted
 * orders come next: they are the only rows here that represent work nobody has
 * picked up, and every minute one waits is a customer who has been charged and
 * told nothing.
 *
 * Sales are subtotals only. The delivery fee is not the kitchen's money and is
 * not shown to it.
 */

export const metadata: Metadata = { title: "Kitchen" };

export const dynamic = "force-dynamic";

export default async function KitchenDashboardPage() {
  const actor = await requireKitchen();
  const data = await loadKitchenDashboard({ kitchenId: actor.kitchenId });
  if (!data) notFound();

  return (
    <Stack>
      <PageHeader
        title={actor.kitchenName}
        sub={`As at ${formatDateTime(data.generatedAt)}`}
        action={
          <Link href="/kitchen/orders" className="kf-btn kf-btn--secondary">
            Open the queue
          </Link>
        }
      />

      {!actor.kitchenIsActive ? (
        <Alert tone="danger">
          This kitchen is suspended by the platform. Orders will not arrive and changes cannot be
          saved until it is reinstated.
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Trading" />
        <CardBody>
          <Stack>
            <AdminToggle
              action="/api/v1/kitchen/open"
              name="isOpen"
              label="Open for orders"
              checked={data.kitchen.isOpen}
              successMessage={data.kitchen.isOpen ? "Kitchen closed." : "Kitchen opened."}
            />
            <p className="kf-muted">
              {data.kitchen.isOpen
                ? "Customers can order from this kitchen right now."
                : "Closed. The menu is visible but nothing can be ordered."}
            </p>
          </Stack>
        </CardBody>
      </Card>

      <MetricGrid>
        <Metric
          label="New orders"
          value={String(data.counts.new)}
          foot="Confirmed, waiting to be accepted"
          attention={data.counts.new > 0}
        />
        <Metric label="Preparing" value={String(data.counts.preparing)} foot="Accepted or cooking" />
        <Metric label="Ready" value={String(data.counts.ready)} foot="Waiting for a rider" />
        <Metric label="Orders today" value={String(data.counts.placedToday)} foot="Since midnight" />
        <Metric
          label="Sales today"
          value={formatNaira(data.salesTodayKobo)}
          foot="Food value, before delivery"
        />
        <Metric
          label="Delivered today"
          value={String(data.counts.deliveredToday)}
          foot={
            data.counts.lostToday === 0
              ? "Nothing cancelled or failed"
              : `${String(data.counts.lostToday)} cancelled or failed`
          }
          attention={data.counts.lostToday > 0}
        />
      </MetricGrid>

      <Card>
        <CardHeader
          title="Waiting to be accepted"
          action={
            <Link href="/kitchen/orders" className="kf-btn kf-btn--ghost kf-btn--sm">
              All orders
            </Link>
          }
        />
        <CardBody flush>
          {data.queue.length === 0 ? (
            <EmptyState title="Nothing waiting">
              Every confirmed order has been accepted. This is the state the queue is meant to reach.
            </EmptyState>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Customer</Th>
                    <Th>Waiting</Th>
                    <Th numeric>Total</Th>
                    <Th>
                      <span className="kf-visually-hidden">Open</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {data.queue.map((row) => (
                    <tr key={row.id}>
                      <Td label="Order">
                        <Link href={`/kitchen/orders/${row.id}`} className="kf-list__title">
                          {row.orderNumber}
                        </Link>
                      </Td>
                      <Td label="Customer">{row.customerName}</Td>
                      <Td label="Waiting">
                        <span className="kf-numeric">{elapsedSince(row.placedAt)}</span>
                      </Td>
                      <Td numeric label="Total">
                        <Money value={formatNaira(row.totalKobo)} />
                      </Td>
                      <Td label="Open">
                        <Link
                          href={`/kitchen/orders/${row.id}`}
                          className="kf-btn kf-btn--secondary kf-btn--sm"
                        >
                          View
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </CardBody>
      </Card>
    </Stack>
  );
}
