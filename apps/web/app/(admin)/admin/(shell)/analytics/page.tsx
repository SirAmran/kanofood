import type { Metadata } from "next";

import { formatNaira } from "@kanofood/core";
import {
  Alert,
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
  Stack,
  Table,
  TableWrap,
  Td,
  Th,
} from "@kanofood/ui";

import { defaultAnalyticsWindow, loadAnalytics } from "@/lib/admin/analytics";
import { requireAdmin } from "@/lib/admin/session";
import { formatDay, lagosDayFromInput } from "@/lib/admin/status";

/**
 * Analytics. Screen 7.11 in docs/UX_SPEC.md.
 *
 * The trading record over a window: what was placed, what arrived, what was lost,
 * what the food was worth and what the platform kept.
 *
 * Three figures here are easy to misread and are labelled for it. Food sold is
 * the sum of subtotals on delivered orders, which is what a kitchen earned.
 * Delivery fees are the platform's own revenue and are never part of a kitchen's
 * settlement. Booked is everything that has not been lost, whatever state it is
 * in, so booked is always larger than delivered until the last order of the
 * window lands.
 *
 * The window is read in one narrow pass and folded here rather than queried
 * thirty times, one round trip per day. The bucketing is by Lagos day, using the
 * same helper the rest of the admin interface uses, so midnight is midnight in
 * one place.
 */

export const metadata: Metadata = { title: "Analytics" };

export const dynamic = "force-dynamic";

type RawSearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

/** A rate that arrived as a fraction, shown as a percentage. */
function percent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const fallback = defaultAnalyticsWindow();

  const fromInput = one(params.from);
  const toInput = one(params.to);

  const from = (fromInput ? lagosDayFromInput(fromInput, "start") : null) ?? fallback.from;
  // The end is inclusive on screen and half-open in the query, so a window
  // ending today covers today.
  const to = (toInput ? lagosDayFromInput(toInput, "end") : null) ?? fallback.to;

  const analytics = await loadAnalytics({
    from,
    to: toInput ? new Date(to.getTime() + 1) : to,
  });

  const { totals, delivery } = analytics;

  return (
    <Stack>
      <PageHeader
        title="Analytics"
        sub={`${formatDay(analytics.from)} to ${formatDay(new Date(analytics.to.getTime() - 1))}.`}
      />

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
              <Field label="&nbsp;" htmlFor="apply">
                <button id="apply" type="submit" className="kf-btn kf-btn--primary kf-btn--block">
                  Apply
                </button>
              </Field>
            </Grid>
          </form>
        </CardBody>
      </Card>

      {analytics.truncated ? (
        <Alert tone="warning">
          This window holds more orders than one page of analytics will read, so the figures below cover the earliest
          ones only. Narrow the dates to get a complete answer.
        </Alert>
      ) : null}

      <MetricGrid>
        <Metric label="Orders placed" value={String(totals.placed)} foot={`${String(totals.live)} still running`} />
        <Metric
          label="Delivered"
          value={String(totals.delivered)}
          foot={`${percent(totals.completionRate)} of orders placed`}
        />
        <Metric
          label="Lost"
          value={String(totals.lost)}
          foot={`${percent(totals.lossRate)} of orders placed`}
          attention={totals.lost > 0}
        />
        <Metric label="Average order" value={formatNaira(totals.averageOrderKobo)} />
      </MetricGrid>

      <Grid>
        <Card>
          <CardHeader title="Money" />
          <CardBody>
            <Stack>
              <Cluster>
                <span className="kf-muted">Food sold</span>
                <Money value={formatNaira(totals.foodKobo)} />
                <span className="kf-muted">delivered orders, what the kitchens earned</span>
              </Cluster>
              <Cluster>
                <span className="kf-muted">Delivery fees</span>
                <Money value={formatNaira(totals.deliveryKobo)} />
                <span className="kf-muted">the platform&apos;s own revenue, never part of a settlement</span>
              </Cluster>
              <Cluster>
                <span className="kf-muted">Commission</span>
                <Money value={formatNaira(totals.commissionKobo)} />
                <span className="kf-muted">kept from the food sold above</span>
              </Cluster>
              <Cluster>
                <span className="kf-muted">Booked</span>
                <Money value={formatNaira(totals.bookedKobo)} />
                <span className="kf-muted">everything not lost, whatever state it is in</span>
              </Cluster>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Customers and delivery" />
          <CardBody>
            <Stack>
              <Cluster>
                <span className="kf-muted">Ordered for the first time</span>
                <span>{String(totals.newCustomers)}</span>
              </Cluster>
              <Cluster>
                <span className="kf-muted">Ordered before</span>
                <span>{String(totals.returningCustomers)}</span>
              </Cluster>
              <Cluster>
                <span className="kf-muted">Deliveries timed</span>
                <span>{String(delivery.count)}</span>
              </Cluster>
              <Cluster>
                <span className="kf-muted">Median trip</span>
                <span>
                  {delivery.medianMinutes === null ? "—" : `${String(delivery.medianMinutes)} min`}
                </span>
              </Cluster>
              <Cluster>
                <span className="kf-muted">Slowest</span>
                <span>
                  {delivery.slowestMinutes === null ? "—" : `${String(delivery.slowestMinutes)} min`}
                </span>
              </Cluster>
              <p className="kf-muted">
                The median is the typical trip; the slowest is the one somebody complained about. Held together
                because either alone is misleading.
              </p>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Card>
        <CardHeader title="Day by day" />
        {analytics.days.length === 0 ? (
          <CardBody>
            <EmptyState title="No orders in this window">
              Nothing was placed between these dates. Widen them, or check that trading has started.
            </EmptyState>
          </CardBody>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Day</Th>
                  <Th numeric>Placed</Th>
                  <Th numeric>Delivered</Th>
                  <Th numeric>Lost</Th>
                  <Th numeric>Running</Th>
                  <Th numeric>Food sold</Th>
                  <Th numeric>Delivery fees</Th>
                  <Th numeric>Commission</Th>
                </tr>
              </thead>
              <tbody>
                {analytics.days.map((day) => (
                  <tr key={day.day}>
                    <Td label="Day">{day.day}</Td>
                    <Td numeric label="Placed">
                      {String(day.placed)}
                    </Td>
                    <Td numeric label="Delivered">
                      {String(day.delivered)}
                    </Td>
                    <Td numeric label="Lost">
                      {day.lost === 0 ? <span className="kf-muted">—</span> : String(day.lost)}
                    </Td>
                    <Td numeric label="Running">
                      {day.live === 0 ? <span className="kf-muted">—</span> : String(day.live)}
                    </Td>
                    <Td numeric label="Food sold">
                      <Money value={formatNaira(day.foodKobo)} />
                    </Td>
                    <Td numeric label="Delivery fees">
                      <Money value={formatNaira(day.deliveryKobo)} />
                    </Td>
                    <Td numeric label="Commission">
                      <Money value={formatNaira(day.commissionKobo)} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Grid>
        <Card>
          <CardHeader title="Kitchens" />
          {analytics.kitchens.length === 0 ? (
            <CardBody>
              <p className="kf-muted">No kitchen took an order in this window.</p>
            </CardBody>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Kitchen</Th>
                    <Th numeric>Orders</Th>
                    <Th numeric>Delivered</Th>
                    <Th numeric>Lost</Th>
                    <Th numeric>Food sold</Th>
                    <Th numeric>Commission</Th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.kitchens.map((kitchen) => (
                    <tr key={kitchen.id}>
                      <Td label="Kitchen">{kitchen.name}</Td>
                      <Td numeric label="Orders">
                        {String(kitchen.orders)}
                      </Td>
                      <Td numeric label="Delivered">
                        {String(kitchen.delivered)}
                      </Td>
                      <Td numeric label="Lost">
                        {kitchen.lost === 0 ? <span className="kf-muted">—</span> : String(kitchen.lost)}
                      </Td>
                      <Td numeric label="Food sold">
                        <Money value={formatNaira(kitchen.foodKobo)} />
                      </Td>
                      <Td numeric label="Commission">
                        <Money value={formatNaira(kitchen.commissionKobo)} />
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
            title="Dishes"
            action={<span className="kf-muted">Delivered orders only</span>}
          />
          {analytics.items.length === 0 ? (
            <CardBody>
              <p className="kf-muted">Nothing was delivered in this window.</p>
            </CardBody>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Dish</Th>
                    <Th numeric>Sold</Th>
                    <Th numeric>Revenue</Th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.items.map((item) => (
                    <tr key={item.name}>
                      {/* Grouped by the name recorded on the order line, not by
                          the dish, because a dish that was renamed or removed
                          still sold what it sold. */}
                      <Td label="Dish">{item.name}</Td>
                      <Td numeric label="Sold">
                        {String(item.quantity)}
                      </Td>
                      <Td numeric label="Revenue">
                        <Money value={formatNaira(item.revenueKobo)} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </Grid>
    </Stack>
  );
}
