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
  Stack,
  Table,
  TableWrap,
  Td,
  Th,
} from "@kanofood/ui";

import {
  KITCHEN_ANALYTICS_RANGES,
  isKitchenAnalyticsRange,
  loadKitchenAnalytics,
} from "@/lib/kitchen/analytics";
import { requireKitchen } from "@/lib/kitchen/session";

/**
 * The kitchen's own numbers. Screen 5.8 in docs/UX_SPEC.md.
 *
 * Money here is food only. The delivery fee is the platform's and the commission
 * is the commercial arrangement; neither appears on this screen, so a kitchen
 * reading it is never told it earned more than it will be paid.
 *
 * The range lives in the URL (`?range=week`) rather than in component state, so a
 * kitchen can bookmark last week's numbers or send the link to someone.
 */

export const metadata: Metadata = { title: "Analytics" };

export const dynamic = "force-dynamic";

const DAY_FORMAT = new Intl.DateTimeFormat("en-NG", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Africa/Lagos",
});

function dayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00+01:00`);
  return Number.isNaN(date.getTime()) ? day : DAY_FORMAT.format(date);
}

function percent(value: number): string {
  return `${String(Math.round(value * 100))}%`;
}

export default async function KitchenAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const actor = await requireKitchen();
  const { range: requested } = await searchParams;
  const range = isKitchenAnalyticsRange(requested) ? requested : "today";

  const analytics = await loadKitchenAnalytics({ kitchenId: actor.kitchenId, range });

  return (
    <Stack>
      <PageHeader
        title="Analytics"
        sub={`${actor.kitchenName}. Food only; delivery fees are not part of your sales.`}
        action={
          <Cluster>
            {KITCHEN_ANALYTICS_RANGES.map((option) => (
              <Link
                key={option.key}
                href={`/kitchen/analytics?range=${option.key}`}
                className={`kf-btn kf-btn--sm ${
                  option.key === range ? "kf-btn--primary" : "kf-btn--ghost"
                }`}
                aria-current={option.key === range ? "page" : undefined}
              >
                {option.label}
              </Link>
            ))}
          </Cluster>
        }
      />

      {analytics.truncated ? (
        <Alert tone="warning">
          There are more orders in this window than the screen will read. The figures below cover
          the most recent {String(analytics.totals.placed)} of them.
        </Alert>
      ) : null}

      <MetricGrid>
        <Metric
          label="Orders placed"
          value={String(analytics.totals.placed)}
          foot={`${String(analytics.totals.live)} still moving`}
          attention={analytics.totals.placed === 0}
        />
        <Metric label="Delivered" value={String(analytics.totals.delivered)} />
        <Metric
          label="Sales"
          value={formatNaira(analytics.totals.foodKobo)}
          foot="Food on delivered orders"
        />
        <Metric
          label="Average order"
          value={formatNaira(analytics.totals.averageOrderKobo)}
          foot="Delivered orders only"
        />
        <Metric
          label="Sell-through"
          value={percent(analytics.totals.sellThrough)}
          foot="Delivered of everything placed"
        />
        <Metric
          label="Lost"
          value={percent(analytics.totals.lossRate)}
          foot={`${String(analytics.totals.lost)} rejected or cancelled`}
          attention={analytics.totals.lossRate >= 0.2}
        />
      </MetricGrid>

      <Card>
        <CardHeader title="Best sellers" />
        <CardBody flush={analytics.items.length > 0}>
          {analytics.items.length === 0 ? (
            <EmptyState title="Nothing sold yet">
              A dish appears here once an order carrying it has been delivered.
            </EmptyState>
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
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="By day" />
        <CardBody flush={analytics.days.length > 0}>
          {analytics.days.length === 0 ? (
            <EmptyState title="No orders in this window">
              Nothing was placed here in the period you chose.
            </EmptyState>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Day</Th>
                    <Th numeric>Placed</Th>
                    <Th numeric>Delivered</Th>
                    <Th numeric>Lost</Th>
                    <Th numeric>Sales</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...analytics.days].reverse().map((day) => (
                    <tr key={day.day}>
                      <Td label="Day">{dayLabel(day.day)}</Td>
                      <Td numeric label="Placed">
                        {String(day.placed)}
                      </Td>
                      <Td numeric label="Delivered">
                        {String(day.delivered)}
                      </Td>
                      <Td numeric label="Lost">
                        {String(day.lost)}
                      </Td>
                      <Td numeric label="Sales">
                        <Money value={formatNaira(day.foodKobo)} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </CardBody>
      </Card>

      <p className="kf-muted">
        Sales count the food on delivered orders. An order still on its way counts as neither
        delivered nor lost, which is why sell-through reads slightly low during service.
      </p>
    </Stack>
  );
}
