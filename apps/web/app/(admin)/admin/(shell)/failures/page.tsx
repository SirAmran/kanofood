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
  Field,
  Grid,
  Input,
  Metric,
  MetricGrid,
  Money,
  PageHeader,
  Select,
  Stack,
  Table,
  TableWrap,
  Td,
  Th,
} from "@kanofood/ui";

import { defaultFailureWindow, loadFailureBoard } from "@/lib/admin/failures";
import { listKitchenOptions } from "@/lib/admin/network";
import { requireAdmin } from "@/lib/admin/session";
import { formatDateTime, lagosDayFromInput, labelForStatus, toneForStatus } from "@/lib/admin/status";

/**
 * Cancellations and failures. Screen 7.10 in docs/UX_SPEC.md.
 *
 * Where the orders that ended badly are read together, because one at a time
 * they are incidents and together they are a pattern. The question this screen
 * exists to answer is whether the commonest customer reason is "wrong address"
 * or "changed my mind", because those two call for different fixes.
 *
 * The reason is read from the `order_events` row that made the transition, not
 * from the order. That is the design working as intended: an order can have many
 * events, and only one of them ended it.
 *
 * Riders are tallied only against failed deliveries. A rider is not at fault for
 * a customer changing their mind, and a table that says otherwise is a table
 * somebody will act on.
 */

export const metadata: Metadata = { title: "Cancellations" };

export const dynamic = "force-dynamic";

type RawSearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

export default async function FailuresPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const fallback = defaultFailureWindow();

  const fromInput = one(params.from);
  const toInput = one(params.to);
  const kitchenId = one(params.kitchen);

  const from = (fromInput ? lagosDayFromInput(fromInput, "start") : null) ?? fallback.from;
  const to = (toInput ? lagosDayFromInput(toInput, "end") : null) ?? fallback.to;

  const [board, kitchens] = await Promise.all([
    loadFailureBoard({ from, to, kitchenId: kitchenId || null }),
    listKitchenOptions(),
  ]);

  const biggestReason = board.byReason[0] ?? null;

  return (
    <Stack>
      <PageHeader
        title="Cancellations and failures"
        sub={`${String(board.totalCount)} orders from ${formatDateTime(from)} to ${formatDateTime(to)}.`}
      />

      {/* A form with a GET method, so a filtered view is a URL that can be sent
          to a colleague and the back button undoes it. */}
      <Card>
        <CardBody>
          <form method="get">
            <Grid>
              <Field label="First day" htmlFor="from">
                <Input id="from" name="from" type="date" defaultValue={fromInput} />
              </Field>
              <Field label="Last day" htmlFor="to">
                <Input id="to" name="to" type="date" defaultValue={toInput} />
              </Field>
              <Field label="Kitchen" htmlFor="kitchen">
                <Select id="kitchen" name="kitchen" defaultValue={kitchenId}>
                  <option value="">All kitchens</option>
                  {kitchens.map((kitchen) => (
                    <option key={kitchen.id} value={kitchen.id}>
                      {kitchen.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="&nbsp;" htmlFor="apply">
                <button id="apply" type="submit" className="kf-btn kf-btn--primary kf-btn--block">
                  Apply
                </button>
              </Field>
            </Grid>
          </form>
        </CardBody>
      </Card>

      <MetricGrid>
        <Metric
          label="Orders lost"
          value={String(board.totalCount)}
          foot={formatNaira(board.totalAmountKobo)}
          attention={board.totalCount > 0}
        />
        <Metric
          label="Commonest reason"
          value={biggestReason ? biggestReason.label : "—"}
          foot={biggestReason ? `${String(biggestReason.count)} times` : "Nothing recorded"}
        />
        <Metric
          label="No reason recorded"
          value={String(board.missingReasonCount)}
          foot="Orders that ended with nothing written down"
          attention={board.missingReasonCount > 0}
        />
        <Metric
          label="Cancelled by customer"
          value={String(board.byStatus.CUSTOMER_CANCELLED ?? 0)}
          foot="The rest ended for other reasons"
        />
      </MetricGrid>

      {board.missingReasonCount > 0 ? (
        <Alert tone="warning">
          {String(board.missingReasonCount)} of these orders ended with no reason recorded. The reason is optional for
          an admin cancellation and for a failed delivery, which is why it can be missing. A reason that is not
          written down is a pattern nobody can see.
        </Alert>
      ) : null}

      <Grid>
        <Card>
          <CardHeader title="Why they ended" />
          <CardBody>
            {board.byReason.length === 0 ? (
              <p className="kf-muted">Nothing was recorded against any of these orders.</p>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Reason</Th>
                      <Th numeric>Orders</Th>
                      <Th numeric>Value</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.byReason.map((tally) => (
                      <tr key={tally.reason}>
                        <Td label="Reason">{tally.label}</Td>
                        <Td numeric label="Orders">
                          {String(tally.count)}
                        </Td>
                        <Td numeric label="Value">
                          <Money value={formatNaira(tally.amountKobo)} />
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
          <CardHeader title="Who they ended on" />
          <CardBody>
            <Stack>
              <Cluster>
                <span className="kf-muted">By ending</span>
                <Badge tone="neutral">customer cancelled</Badge>
                <span>{String(board.byStatus.CUSTOMER_CANCELLED ?? 0)}</span>
                <Badge tone="danger">kitchen rejected</Badge>
                <span>{String(board.byStatus.KITCHEN_REJECTED ?? 0)}</span>
                <Badge tone="danger">admin cancelled</Badge>
                <span>{String(board.byStatus.ADMIN_CANCELLED ?? 0)}</span>
                <Badge tone="danger">delivery failed</Badge>
                <span>{String(board.byStatus.DELIVERY_FAILED ?? 0)}</span>
              </Cluster>

              <div>
                <span className="kf-muted">Kitchens with the most</span>
                {board.worstKitchens.length === 0 ? (
                  <p className="kf-muted">None.</p>
                ) : (
                  <TableWrap>
                    <Table>
                      <thead>
                        <tr>
                          <Th>Kitchen</Th>
                          <Th numeric>Orders</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {board.worstKitchens.map((tally) => (
                          <tr key={tally.id}>
                            <Td label="Kitchen">
                              <Link href={`/admin/kitchens/${tally.id}`}>{tally.name}</Link>
                            </Td>
                            <Td numeric label="Orders">
                              {String(tally.count)}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableWrap>
                )}
              </div>

              <div>
                <span className="kf-muted">Riders with failed deliveries</span>
                {board.worstRiders.length === 0 ? (
                  <p className="kf-muted">No delivery failed in this period.</p>
                ) : (
                  <TableWrap>
                    <Table>
                      <thead>
                        <tr>
                          <Th>Rider</Th>
                          <Th numeric>Failures</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {board.worstRiders.map((tally) => (
                          <tr key={tally.id}>
                            <Td label="Rider">
                              <Link href={`/admin/riders/${tally.id}`}>{tally.name}</Link>
                            </Td>
                            <Td numeric label="Failures">
                              {String(tally.count)}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableWrap>
                )}
                <p className="kf-muted">
                  Only failed deliveries are counted here. A rider is not at fault for a customer changing their mind.
                </p>
              </div>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Card>
        <CardHeader
          title="Every one of them"
          action={<span className="kf-muted">{`${String(board.orders.length)} shown, newest first`}</span>}
        />
        {board.orders.length === 0 ? (
          <CardBody>
            <EmptyState title="Nothing ended badly">
              No order in this period was cancelled, rejected or failed. Try a wider date range.
            </EmptyState>
          </CardBody>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>Ended as</Th>
                  <Th>Reason</Th>
                  <Th>Who</Th>
                  <Th>When</Th>
                  <Th numeric>Value</Th>
                </tr>
              </thead>
              <tbody>
                {board.orders.map((row) => (
                  <tr key={row.id}>
                    <Td label="Order">
                      <Link href={`/admin/orders/${row.id}`}>{row.orderNumber}</Link>
                      <div className="kf-muted">
                        <Link href={`/admin/kitchens/${row.kitchenId}`}>{row.kitchenName}</Link>
                      </div>
                    </Td>
                    <Td label="Ended as">
                      <Badge tone={toneForStatus(row.status)}>{labelForStatus(row.status)}</Badge>
                    </Td>
                    {/* The label comes off the row: the service is what knows
                        how to turn a stored reason into words, and it has
                        already done it once for the tally above. */}
                    <Td label="Reason">{row.reasonLabel}</Td>
                    <Td label="Who">
                      {row.actorName ?? <span className="kf-muted">Not recorded</span>}
                      {row.actorRole ? <div className="kf-muted">{row.actorRole}</div> : null}
                    </Td>
                    <Td label="When">{formatDateTime(row.at)}</Td>
                    <Td numeric label="Value">
                      <Money value={formatNaira(row.totalKobo)} />
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
