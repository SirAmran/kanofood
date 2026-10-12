import type { Metadata } from "next";
import Link from "next/link";

import { formatNaira } from "@kanofood/core";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Money,
  PageHeader,
  SectionHeader,
  Stack,
  Table,
  TableWrap,
  Td,
  Th,
} from "@kanofood/ui";

import { AdminDelete } from "@/app/(admin)/_components/admin-delete";
import { AdminForm } from "@/app/(admin)/_components/admin-form";
import { listKitchenOptions } from "@/lib/admin/network";
import { requireAdmin } from "@/lib/admin/session";
import { listSettlements, settlementSuggestions, settlementModelText } from "@/lib/admin/settlements";
import { formatDay, formatDateTime, toDateInput } from "@/lib/admin/status";

/**
 * Settlements. Screen 7.9 in docs/UX_SPEC.md.
 *
 * What the platform owes each kitchen for a closed period, and the record of
 * having paid it. The money itself moves by bank transfer outside this system;
 * what happens here is the statement and the reference.
 *
 * **The period is measured by delivery, and only delivered orders count.** An
 * order still in flight when a period closes might yet be cancelled, and settling
 * it means clawing money back afterwards. A closed period therefore never
 * reopens, and there is no void status for the same reason: a paid settlement is
 * corrected by a conversation and a compensating entry, not by editing history.
 *
 * The figures are computed by the service from `computeSettlement` in core. This
 * page shows them and never calculates one.
 */

export const metadata: Metadata = { title: "Settlements" };

export const dynamic = "force-dynamic";

export default async function SettlementsPage() {
  await requireAdmin();

  const [settlements, suggestions, kitchens] = await Promise.all([
    listSettlements({}),
    settlementSuggestions(),
    listKitchenOptions(),
  ]);

  const pending = settlements.filter((row) => row.status !== "paid");
  const owedKobo = pending.reduce((total, row) => total + row.netPayableKobo, 0n);

  const kitchenOptions = kitchens.map((kitchen) => ({ value: kitchen.id, label: kitchen.name }));

  // The last seven complete Lagos days, which is what the suggestions below
  // cover. Today is excluded so a day still being traded is never settled once
  // and again tomorrow.
  const suggestionsTotalKobo = suggestions.reduce((total, item) => total + item.draft.netPayableKobo, 0n);

  return (
    <Stack>
      <PageHeader
        title="Settlements"
        sub={
          pending.length === 0
            ? "Nothing outstanding."
            : `${String(pending.length)} unpaid, ${formatNaira(owedKobo)} owed in total.`
        }
      />

      <Alert tone="info">
        A period is counted by delivery date and only delivered orders count, so a closed period never reopens. A
        settlement nobody has paid can be removed. A paid one cannot: the money left the account, and the correction
        is a record, not a deleted row.
      </Alert>

      <Card>
        <CardHeader
          title="What each kitchen is owed"
          action={<span className="kf-muted">Seven complete days, today excluded</span>}
        />
        {suggestions.length === 0 ? (
          <CardBody>
            <EmptyState title="No kitchens to settle">
              A settlement needs an active kitchen. Add one before recording what it is owed.
            </EmptyState>
          </CardBody>
        ) : (
          <>
            <CardBody>
              <p className="kf-muted">
                These are drafts, computed from delivered orders and the commission rate in force at the time of
                delivery. Nothing is written until the button is pressed, and {formatNaira(suggestionsTotalKobo)} is
                what all of them come to.
              </p>
            </CardBody>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Kitchen</Th>
                    <Th>Period</Th>
                    <Th numeric>Orders</Th>
                    <Th numeric>Food sold</Th>
                    <Th numeric>Commission</Th>
                    <Th numeric>To pay</Th>
                    <Th>Record it</Th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((item) => (
                    <tr key={item.kitchenId}>
                      <Td label="Kitchen">
                        <Link href={`/admin/kitchens/${item.kitchenId}`}>{item.kitchenName}</Link>
                        <div className="kf-muted">
                          {item.draft.commissionRate === null
                            ? "Platform default rate"
                            : `${item.draft.commissionRate}%`}
                        </div>
                      </Td>
                      <Td label="Period">
                        {`${formatDay(item.draft.periodStart)} to ${formatDay(item.draft.periodEnd)}`}
                      </Td>
                      <Td numeric label="Orders">
                        {String(item.draft.orderCount)}
                      </Td>
                      <Td numeric label="Food sold">
                        <Money value={formatNaira(item.draft.grossKobo)} />
                      </Td>
                      <Td numeric label="Commission">
                        <Money value={formatNaira(item.draft.commissionKobo)} negative />
                      </Td>
                      <Td numeric label="To pay">
                        <Money value={formatNaira(item.draft.netPayableKobo)} />
                      </Td>
                      <Td label="Record it">
                        {item.draft.blockedBy ? (
                          <Alert tone="warning">
                            Already covered by a settlement ending {formatDay(item.draft.blockedBy.periodEnd)}. A
                            second one would pay for the same deliveries twice.
                          </Alert>
                        ) : item.draft.orderCount === 0 ? (
                          <span className="kf-muted">Nothing delivered, so nothing to record.</span>
                        ) : (
                          <AdminForm
                            action="/api/v1/admin/settlements"
                            submitLabel="Record"
                            successMessage="Settlement recorded as unpaid."
                            hidden={{
                              kitchenId: item.kitchenId,
                              from: toDateInput(item.draft.periodStart),
                              to: toDateInput(new Date(item.draft.periodEnd.getTime() - 1)),
                            }}
                            fields={[]}
                          />
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </>
        )}
      </Card>

      <Card>
        <CardHeader title="Record one by hand" />
        <CardBody>
          <Stack>
            <p className="kf-muted">
              For a period the suggestions do not cover, or a kitchen that has been switched off. The figures are
              recomputed from the orders in the period, so a period with nothing delivered in it cannot be recorded.
            </p>
            <AdminForm
              action="/api/v1/admin/settlements"
              submitLabel="Record settlement"
              successMessage="Settlement recorded as unpaid."
              fields={[
                {
                  name: "kitchenId",
                  label: "Kitchen",
                  type: "select",
                  options: kitchenOptions,
                  required: true,
                },
                {
                  name: "from",
                  label: "First day",
                  type: "date",
                  required: true,
                  hint: "Included.",
                },
                {
                  name: "to",
                  label: "Last day",
                  type: "date",
                  required: true,
                  hint: "Included.",
                },
                {
                  name: "model",
                  label: "Settlement model",
                  type: "select",
                  value: "model_a",
                  options: [
                    { value: "model_a", label: "Model A. Customer pays the rider, platform pays the kitchen after" },
                    { value: "model_b", label: "Model B. Platform pays the kitchen upfront, platform collects" },
                  ],
                  hint: "Recorded for the record. It does not change the figures.",
                },
              ]}
            />
          </Stack>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="All settlements"
          action={<span className="kf-muted">{`${String(settlements.length)} most recent`}</span>}
        />
        {settlements.length === 0 ? (
          <CardBody>
            <EmptyState title="None recorded yet">
              Nothing has been settled. The suggestions above are where a first one comes from.
            </EmptyState>
          </CardBody>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Kitchen</Th>
                  <Th>Period</Th>
                  <Th numeric>Food sold</Th>
                  <Th numeric>Commission</Th>
                  <Th numeric>Net</Th>
                  <Th>Model</Th>
                  <Th>State</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((row) => (
                  <tr key={row.id}>
                    <Td label="Kitchen">
                      <Link href={`/admin/kitchens/${row.kitchenId}`}>{row.kitchenName}</Link>
                    </Td>
                    <Td label="Period">
                      {`${formatDay(row.periodStart)} to ${formatDay(new Date(row.periodEnd.getTime() - 1))}`}
                    </Td>
                    <Td numeric label="Food sold">
                      <Money value={formatNaira(row.grossKobo)} />
                    </Td>
                    <Td numeric label="Commission">
                      <Money value={formatNaira(row.commissionKobo)} negative />
                    </Td>
                    <Td numeric label="Net">
                      <Money value={formatNaira(row.netPayableKobo)} />
                    </Td>
                    <Td label="Model">
                      <span className="kf-muted">{settlementModelText(row.model)}</span>
                    </Td>
                    <Td label="State">
                      {row.status === "paid" ? (
                        <Stack tight>
                          <Badge tone="success">Paid</Badge>
                          {row.paidAt ? <span className="kf-muted">{formatDateTime(row.paidAt)}</span> : null}
                          {row.reference ? <span className="kf-muted">{row.reference}</span> : null}
                          {row.paidBy ? <span className="kf-muted">by {row.paidBy}</span> : null}
                        </Stack>
                      ) : (
                        <Badge tone="warning">Unpaid</Badge>
                      )}
                    </Td>
                    <Td label="Actions">
                      {row.status === "paid" ? (
                        <span className="kf-muted">Settled in full.</span>
                      ) : (
                        <Stack tight>
                          {/* A reference is required because it is the only
                              thing tying this row to the bank transfer. A paid
                              settlement with no reference cannot be reconciled
                              against a statement later. */}
                          <details>
                            <summary className="kf-muted">Mark as paid</summary>
                            <AdminForm
                              action={`/api/v1/admin/settlements/${row.id}/pay`}
                              submitLabel="Mark paid"
                              successMessage="Settlement marked paid."
                              fields={[
                                {
                                  name: "reference",
                                  label: "Transfer reference",
                                  type: "text",
                                  required: true,
                                  hint: "From the bank transfer. It is what ties this row to the statement.",
                                },
                              ]}
                            />
                          </details>
                          <AdminDelete
                            action={`/api/v1/admin/settlements/${row.id}`}
                            what="this settlement"
                            label="Remove"
                            warning="Only an unpaid settlement can be removed. Use this when the period was wrong."
                          />
                        </Stack>
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
        <CardHeader title="Reconcile a period against the bank" />
        <CardBody>
          <Stack>
            <SectionHeader title="How a payment is matched" />
            <p className="kf-muted">
              The reference recorded against each paid settlement is what a bank statement is checked against. Every
              line in the table above that is marked paid carries one.
            </p>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}
