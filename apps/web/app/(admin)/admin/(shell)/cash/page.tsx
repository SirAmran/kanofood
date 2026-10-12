import type { Metadata } from "next";
import Link from "next/link";

import { formatNaira } from "@kanofood/core";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Cluster,
  EmptyState,
  Metric,
  MetricGrid,
  Money,
  PageHeader,
  SectionHeader,
  Spread,
  Stack,
  Table,
  TableWrap,
  Td,
  Th,
} from "@kanofood/ui";

import { AdminAction } from "@/app/(admin)/_components/admin-action";
import { AdminForm } from "@/app/(admin)/_components/admin-form";
import { loadCashBoard } from "@/lib/admin/cash";
import { requireAdmin } from "@/lib/admin/session";
import { formatDateTime } from "@/lib/admin/status";

/**
 * Cash. Screen 7.8 in docs/UX_SPEC.md.
 *
 * Two ledgers meet on this screen and they are not the same ledger.
 *
 * `cash_collections` is a rider's float: money a rider collected on delivery and
 * owes the office. It moves pending, handed over, received. `payments` is what
 * the customer owed for one order, and it moves pending, collected, reconciled.
 * They share no key, so a handover cannot be traced to the orders it settled and
 * the two totals below can legitimately disagree.
 *
 * That is a real gap rather than a display problem, and the screen says so
 * instead of implying a reconciliation it cannot perform.
 */

export const metadata: Metadata = { title: "Cash" };

export const dynamic = "force-dynamic";

/** How long a float can sit before somebody should be asking about it. */
const LATE_HOURS = 24;

export default async function CashPage() {
  await requireAdmin();
  const board = await loadCashBoard();

  const late = board.pending.filter((row) => row.ageHours >= LATE_HOURS);

  return (
    <Stack>
      <PageHeader title="Cash" sub="What riders are holding, and what the office has counted." />

      <MetricGrid>
        <Metric
          label="Out with riders"
          value={formatNaira(board.pendingTotalKobo)}
          foot={`${String(board.pending.length)} handovers waiting`}
          attention={board.pendingTotalKobo > 0n}
        />
        <Metric label="Handed over" value={formatNaira(board.handedOverKobo)} foot="Waiting to be received" />
        <Metric label="Received today" value={formatNaira(board.receivedTodayKobo)} />
        <Metric
          label="Unreconciled"
          value={formatNaira(board.unreconciledTotalKobo)}
          foot={`${String(board.unreconciled.length)} payments`}
        />
      </MetricGrid>

      <Alert tone="info">
        Handovers and payments are two separate ledgers with no key between them. A handover cannot be traced to the
        orders behind it, so these totals are not expected to match. That is recorded as a gap against the schema.
      </Alert>

      {late.length > 0 ? (
        <Alert tone="warning">
          {String(late.length)} handovers have been outstanding for more than {String(LATE_HOURS)} hours, the oldest
          for {String(Math.floor(late[0]?.ageHours ?? 0))} hours. Oldest first below.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Rider handovers"
          action={<span className="kf-muted">{`${String(board.pending.length)} waiting`}</span>}
        />
        {board.pending.length === 0 ? (
          <CardBody>
            <EmptyState title="No cash outstanding">
              Every handover has been received. Riders holding nothing are not listed here.
            </EmptyState>
          </CardBody>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Rider</Th>
                  <Th numeric>Amount</Th>
                  <Th>Collected</Th>
                  <Th>State</Th>
                  <Th>Next step</Th>
                </tr>
              </thead>
              <tbody>
                {board.pending.map((row) => (
                  <tr key={row.id}>
                    <Td label="Rider">
                      <Link href={`/admin/riders/${row.riderId}`}>{row.riderName}</Link>
                      {row.notes ? <div className="kf-muted">{row.notes}</div> : null}
                    </Td>
                    <Td numeric label="Amount">
                      <Money value={formatNaira(row.amountKobo)} />
                    </Td>
                    <Td label="Collected">
                      {formatDateTime(row.collectedAt)}
                      <div className="kf-muted">
                        {row.ageHours >= LATE_HOURS ? (
                          <Badge tone="warning">{`${String(Math.floor(row.ageHours))} hours ago`}</Badge>
                        ) : (
                          `${String(Math.floor(row.ageHours))} hours ago`
                        )}
                      </div>
                    </Td>
                    <Td label="State">
                      <Badge tone={row.status === "handed_over" ? "accent" : "neutral"}>{row.status}</Badge>
                    </Td>
                    <Td label="Next step">
                      {/* The two steps are done by different people: the rider
                          marks the handover, the office marks the receipt. So
                          the row only ever offers the step it is actually
                          waiting on. */}
                      {row.status === "pending" ? (
                        <AdminForm
                          action={`/api/v1/admin/cash/collections/${row.id}/handover`}
                          submitLabel="Mark handed over"
                          successMessage="Handover recorded."
                          fields={[
                            {
                              name: "notes",
                              label: "Note",
                              type: "textarea",
                              rows: 2,
                              hint: "Optional. What was handed over and to whom.",
                            },
                          ]}
                        />
                      ) : (
                        <AdminForm
                          action={`/api/v1/admin/cash/collections/${row.id}/receive`}
                          submitLabel="Receive"
                          successMessage="Cash received."
                          fields={[
                            {
                              name: "notes",
                              label: "Note",
                              type: "textarea",
                              rows: 2,
                              hint: "Optional. Any discrepancy, counted short or over.",
                            },
                          ]}
                        />
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Payments to reconcile"
          action={
            board.unreconciled.length === 0 ? null : (
              <AdminAction
                action="/api/v1/admin/payments/reconcile"
                body={{ ids: board.unreconciled.slice(0, 200).map((row) => row.id) }}
                label={`Reconcile all ${String(Math.min(board.unreconciled.length, 200))}`}
                successMessage="Payments reconciled."
              />
            )
          }
        />

        <CardBody>
          <Stack>
            <SectionHeader title="What this does" />
            <p className="kf-muted">
              Reconciling agrees that the money expected against an order is the money received. It is the step after
              the cash is in the office, and there is no way to undo it. A mistake here is corrected with a
              compensating record, which does not exist yet.
            </p>
            <p className="kf-muted">
              Every payment below is already collected. Reconciling all of them is the usual end-of-day action; the
              buttons on each row are for the ones that need looking at first.
            </p>
          </Stack>
        </CardBody>

        {board.unreconciled.length === 0 ? (
          <CardBody>
            <EmptyState title="Nothing to reconcile">
              Every collected payment has been agreed against its order.
            </EmptyState>
          </CardBody>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>Kitchen</Th>
                  <Th>Method</Th>
                  <Th numeric>Amount</Th>
                  <Th>Collected</Th>
                  <Th>Reconcile</Th>
                </tr>
              </thead>
              <tbody>
                {board.unreconciled.map((row) => (
                  <tr key={row.id}>
                    <Td label="Order">
                      <Link href={`/admin/orders/${row.orderId}`}>{row.orderNumber}</Link>
                    </Td>
                    <Td label="Kitchen">{row.kitchenName}</Td>
                    <Td label="Method">{row.method}</Td>
                    <Td numeric label="Amount">
                      <Money value={formatNaira(row.amountKobo)} />
                    </Td>
                    <Td label="Collected">
                      {row.collectedAt ? formatDateTime(row.collectedAt) : <span className="kf-muted">—</span>}
                      {row.collectedBy ? <div className="kf-muted">{row.collectedBy}</div> : null}
                    </Td>
                    <Td label="Reconcile">
                      <AdminAction
                        action={`/api/v1/admin/payments/${row.id}/reconcile`}
                        label="Reconcile"
                        successMessage="Payment reconciled."
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHeader title="Today" />
        <CardBody>
          <Spread>
            <Cluster>
              <span className="kf-muted">Collected today</span>
              <Money value={formatNaira(board.collectedTodayKobo)} />
            </Cluster>
            <Cluster>
              <span className="kf-muted">Received from riders today</span>
              <Money value={formatNaira(board.receivedTodayKobo)} />
            </Cluster>
          </Spread>
        </CardBody>
      </Card>
    </Stack>
  );
}
