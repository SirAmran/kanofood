import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatNaira, isOrderStatus } from "@kanofood/core";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Cluster,
  EmptyState,
  Grid,
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

import { AdminForm } from "@/app/(admin)/_components/admin-form";
import { AdminToggle } from "@/app/(admin)/_components/admin-toggle";
import { loadRider } from "@/lib/admin/network";
import { requireAdmin } from "@/lib/admin/session";
import { elapsedSince, formatDateTime, labelForStatus, toneForRiderState } from "@/lib/admin/status";

/**
 * One rider. Screen 7.6 in docs/UX_SPEC.md, detail half.
 *
 * The two switches are different questions. "Trading on the platform" is a
 * staffing decision that revokes their sessions; "available for deliveries" is
 * the rider's own shift, which they normally set themselves from their app and
 * which an operator only overrides when a rider has gone home without saying so.
 * Suspending a rider deliberately does not clear their availability, so
 * reinstating one puts them back where they were rather than silently on shift.
 */

export const metadata: Metadata = { title: "Rider" };

export const dynamic = "force-dynamic";

export default async function RiderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const { id } = await params;
  const rider = await loadRider(id);
  if (!rider) notFound();

  const finished = rider.deliveries.filter((delivery) => delivery.minutes !== null);
  const averageMinutes =
    finished.length === 0
      ? null
      : Math.round(finished.reduce((total, delivery) => total + (delivery.minutes ?? 0), 0) / finished.length);

  return (
    <Stack>
      <PageHeader
        title={rider.name}
        sub={
          <Cluster>
            <span className="kf-muted">{rider.phone}</span>
            {rider.vehicle ? <span className="kf-muted">{rider.vehicle}</span> : null}
            {rider.email ? <span className="kf-muted">{rider.email}</span> : null}
            <Link href="/admin/riders">All riders</Link>
          </Cluster>
        }
        action={
          <Cluster>
            <Badge tone={toneForRiderState(rider.state)}>{rider.state}</Badge>
          </Cluster>
        }
      />

      {!rider.userIsActive && rider.isActive ? (
        <Alert tone="warning">
          The login behind this rider is switched off, so they cannot sign in even though the rider record is
          trading. Switch the rider off and on again to restore the sessions.
        </Alert>
      ) : null}

      <MetricGrid>
        <Metric label="Delivered today" value={String(rider.deliveredToday)} />
        <Metric label="Failed today" value={String(rider.failedToday)} />
        <Metric label="Running now" value={String(rider.inFlight)} />
        <Metric
          label="Average trip"
          value={averageMinutes === null ? "—" : `${String(averageMinutes)} min`}
          foot="Across the deliveries below"
        />
      </MetricGrid>

      <Grid>
        <Card>
          <CardHeader title="Cash" />
          <CardBody>
            <Stack>
              {/* The two figures are separate on purpose. Cash in hand is money
                  the platform cannot account for yet; handed over is money a
                  rider says they have given up. Only the cash screen can move
                  either, because that is where the operator is looking at both
                  sides of it. */}
              <Cluster>
                <Money value={formatNaira(rider.cashInHandKobo)} />
                <span className="kf-muted">in hand, not yet handed over</span>
              </Cluster>
              <Cluster>
                <Money value={formatNaira(rider.cashHandedOverKobo)} />
                <span className="kf-muted">handed over, waiting to be received</span>
              </Cluster>
              <Link href="/admin/cash">Open the cash screen</Link>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Switches" />
          <CardBody>
            <Stack>
              <AdminToggle
                action={`/api/v1/admin/riders/${rider.id}/active`}
                name="isActive"
                label="Trading on the platform"
                checked={rider.isActive}
                successMessage={rider.isActive ? "Rider suspended." : "Rider reinstated."}
              />
              <AdminToggle
                action={`/api/v1/admin/riders/${rider.id}/availability`}
                name="isAvailable"
                label="Available for deliveries"
                checked={rider.isAvailable}
                successMessage={rider.isAvailable ? "Rider taken off shift." : "Rider put on shift."}
              />
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Card>
        <CardHeader title="Details" />
        <CardBody>
          <AdminForm
            action={`/api/v1/admin/riders/${rider.id}`}
            method="PATCH"
            submitLabel="Save details"
            successMessage="Rider saved."
            fields={[
              { name: "name", label: "Name", type: "text", value: rider.name, required: true },
              { name: "phone", label: "Phone", type: "text", value: rider.phone, required: true },
              { name: "vehicle", label: "Vehicle", type: "text", value: rider.vehicle ?? "" },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Deliveries"
          action={<span className="kf-muted">{`${String(rider.deliveries.length)} shown`}</span>}
        />
        {rider.deliveries.length === 0 ? (
          <CardBody>
            <EmptyState title="No deliveries yet">
              Once this rider is assigned an order it appears here, finished or not.
            </EmptyState>
          </CardBody>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>Status</Th>
                  <Th>Assigned</Th>
                  <Th numeric>Took</Th>
                  <Th numeric>Value</Th>
                </tr>
              </thead>
              <tbody>
                {rider.deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <Td label="Order">
                      <Link href={`/admin/orders/${delivery.orderId}`}>{delivery.orderNumber}</Link>
                    </Td>
                    <Td label="Status">
                      {/* The status word comes from the same table the customer
                          and the kitchen read, so one order is never two
                          different words on two screens. A value that is not a
                          real status is shown as it is stored rather than
                          guessed at. */}
                      {isOrderStatus(delivery.status) ? (
                        <Badge tone={delivery.status === "DELIVERED" ? "success" : "neutral"}>
                          {labelForStatus(delivery.status)}
                        </Badge>
                      ) : (
                        <span className="kf-muted">{delivery.status}</span>
                      )}
                    </Td>
                    <Td label="Assigned">
                      {formatDateTime(delivery.assignedAt)}
                      {delivery.deliveredAt ? (
                        <div className="kf-muted">delivered {elapsedSince(delivery.deliveredAt)}</div>
                      ) : delivery.failedAt ? (
                        <div className="kf-muted">failed {elapsedSince(delivery.failedAt)}</div>
                      ) : null}
                    </Td>
                    <Td numeric label="Took">
                      {delivery.minutes === null ? (
                        <span className="kf-muted">Running</span>
                      ) : (
                        `${String(delivery.minutes)} min`
                      )}
                    </Td>
                    <Td numeric label="Value">
                      <Money value={formatNaira(delivery.totalKobo)} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </Stack>
  );
}
