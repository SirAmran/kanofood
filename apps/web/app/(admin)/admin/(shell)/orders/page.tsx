import type { Metadata } from "next";
import Link from "next/link";

import { ACTIVE_STATUSES, formatNaira } from "@kanofood/core";
import type { OrderStatus } from "@kanofood/core";
import {
  Card,
  CardBody,
  Cluster,
  EmptyState,
  Field,
  Grid,
  Input,
  Money,
  Pagination,
  PageHeader,
  Select,
  Stack,
  StatusPill,
  Table,
  TableWrap,
  Tabs,
  Td,
  Th,
} from "@kanofood/ui";

import { listOrders, DEFAULT_PAGE_SIZE } from "@/lib/admin/orders";
import { listKitchenOptions, listRiderOptions } from "@/lib/admin/network";
import { requireAdmin } from "@/lib/admin/session";
import { elapsedSince, formatDateTime, lagosDayFromInput, toneForStatus, labelForStatus } from "@/lib/admin/status";

/**
 * Orders. Screen 7.3 in docs/UX_SPEC.md.
 *
 * The day's operations, filtered. Everything a filter can express lives in the
 * URL and the form is a native GET, so a filtered view is a link that can be
 * pasted to a colleague, the back button undoes a filter, and the whole screen
 * works with JavaScript still loading.
 *
 * The filter set is the one the spec names: date, kitchen, rider, status, and
 * free search over the order number, the customer name and the phone. That
 * last one is deliberately three fields wide. An operator on the phone has an
 * order number off a receipt or a caller's number on the handset, and asking
 * them to choose which field they are searching is a decision the search can
 * make itself.
 */

export const metadata: Metadata = { title: "Orders" };

export const dynamic = "force-dynamic";

/**
 * The tabs, grouped by the question an operator is actually asking.
 *
 * A tab per status would be thirteen tabs that nobody reads. These five are the
 * shapes the day takes: what needs a call, what is moving, what finished, and
 * what ended badly. `waiting` is first after All because it is the only group
 * that represents work nobody has started.
 */
const GROUPS: readonly {
  readonly key: string;
  readonly label: string;
  readonly statuses: readonly OrderStatus[] | null;
}[] = [
  { key: "all", label: "All", statuses: null },
  { key: "waiting", label: "Waiting for a call", statuses: ["PENDING_CONFIRMATION"] },
  {
    key: "live",
    label: "In progress",
    statuses: ACTIVE_STATUSES.filter((status) => status !== "PENDING_CONFIRMATION"),
  },
  { key: "delivered", label: "Delivered", statuses: ["DELIVERED"] },
  {
    key: "ended",
    label: "Ended badly",
    statuses: ["CUSTOMER_CANCELLED", "KITCHEN_REJECTED", "ADMIN_CANCELLED", "DELIVERY_FAILED"],
  },
];

interface Search {
  readonly status: string;
  readonly q: string;
  readonly kitchen: string;
  readonly rider: string;
  readonly from: string;
  readonly to: string;
  readonly page: number;
}

type RawSearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

function readSearch(params: RawSearchParams): Search {
  const page = Number.parseInt(one(params.page), 10);
  const status = one(params.status);
  return {
    status: GROUPS.some((group) => group.key === status) ? status : "all",
    q: one(params.q),
    kitchen: one(params.kitchen),
    rider: one(params.rider),
    from: one(params.from),
    to: one(params.to),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** The query string for a search, with anything given overriding it. */
function queryFor(search: Search, overrides: Partial<Search> = {}): string {
  const merged = { ...search, ...overrides };
  const query = new URLSearchParams();

  if (merged.status !== "all") query.set("status", merged.status);
  if (merged.q) query.set("q", merged.q);
  if (merged.kitchen) query.set("kitchen", merged.kitchen);
  if (merged.rider) query.set("rider", merged.rider);
  if (merged.from) query.set("from", merged.from);
  if (merged.to) query.set("to", merged.to);
  if (merged.page > 1) query.set("page", String(merged.page));

  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireAdmin();

  const search = readSearch(await searchParams);
  const group = GROUPS.find((item) => item.key === search.status) ?? GROUPS[0]!;

  const [result, kitchens, riders] = await Promise.all([
    listOrders({
      ...(group.statuses ? { statuses: group.statuses } : {}),
      ...(search.kitchen ? { kitchenId: search.kitchen } : {}),
      ...(search.rider ? { riderId: search.rider } : {}),
      ...(search.q ? { q: search.q } : {}),
      ...(search.from ? { from: lagosDayFromInput(search.from, "start") ?? undefined } : {}),
      ...(search.to ? { to: lagosDayFromInput(search.to, "end") ?? undefined } : {}),
      page: search.page,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    listKitchenOptions(),
    listRiderOptions(),
  ]);

  const activeFilters =
    search.q !== "" ||
    search.kitchen !== "" ||
    search.rider !== "" ||
    search.from !== "" ||
    search.to !== "";

  const countFor = (statuses: readonly OrderStatus[] | null): number => {
    if (statuses === null) {
      return Object.values(result.statusCounts).reduce((sum, value) => sum + (value ?? 0), 0);
    }
    return statuses.reduce((sum, status) => sum + (result.statusCounts[status] ?? 0), 0);
  };

  return (
    <Stack>
      <PageHeader
        title="Orders"
        sub={
          activeFilters
            ? `${String(result.total)} matching, newest first`
            : `${String(result.total)} orders, newest first`
        }
      />

      <Tabs
        label="Order status"
        activeHref={`/admin/orders${queryFor(search, { status: group.key, page: 1 })}`}
        items={GROUPS.map((item) => ({
          href: `/admin/orders${queryFor(search, { status: item.key, page: 1 })}`,
          label: item.label,
          count: countFor(item.statuses),
        }))}
      />

      <Card>
        <CardBody>
          {/* A native GET form. No client boundary, and the filters end up in the
              URL exactly as they would if a script had pushed them there. */}
          <form method="get" action="/admin/orders">
            {group.key === "all" ? null : <input type="hidden" name="status" value={group.key} />}

            <Grid wide>
              <Field label="Search" htmlFor="q" hint="Order number, customer name or phone">
                <Input
                  name="q"
                  type="search"
                  defaultValue={search.q}
                  placeholder="KF-1042 or 0803..."
                />
              </Field>

              <Field label="Kitchen" htmlFor="kitchen">
                <Select name="kitchen" defaultValue={search.kitchen}>
                  <option value="">All kitchens</option>
                  {kitchens.map((kitchen) => (
                    <option key={kitchen.id} value={kitchen.id}>
                      {kitchen.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Rider" htmlFor="rider">
                <Select name="rider" defaultValue={search.rider}>
                  <option value="">All riders</option>
                  {riders.map((rider) => (
                    <option key={rider.id} value={rider.id}>
                      {rider.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="From" htmlFor="from">
                <Input name="from" type="date" defaultValue={search.from} />
              </Field>

              <Field label="To" htmlFor="to">
                <Input name="to" type="date" defaultValue={search.to} />
              </Field>
            </Grid>

            <Cluster className="kf-filters__actions">
              <button type="submit" className="kf-btn kf-btn--primary">
                Apply
              </button>
              {activeFilters ? (
                <Link
                  href={`/admin/orders${queryFor(search, { q: "", kitchen: "", rider: "", from: "", to: "", page: 1 })}`}
                  className="kf-btn kf-btn--ghost"
                >
                  Clear
                </Link>
              ) : null}
            </Cluster>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody flush>
          {result.rows.length === 0 ? (
            <EmptyState
              title={activeFilters ? "No orders match" : "No orders yet"}
              action={
                activeFilters ? (
                  <Link href="/admin/orders" className="kf-btn kf-btn--secondary">
                    Clear the filters
                  </Link>
                ) : null
              }
            >
              {activeFilters
                ? "Nothing matches this combination. Widen the dates, or clear the filters."
                : "Orders will appear here as customers place them."}
            </EmptyState>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Status</Th>
                    <Th>Customer</Th>
                    <Th>Kitchen</Th>
                    <Th>Rider</Th>
                    <Th>Placed</Th>
                    <Th numeric>Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.id}>
                      <Td label="Order">
                        <Link href={`/admin/orders/${row.id}`} className="kf-list__title">
                          {row.orderNumber}
                        </Link>
                        <div className="kf-list__meta">
                          {row.itemCount === 1 ? "1 item" : `${String(row.itemCount)} items`}
                          {row.paymentMethod === "cod" ? " - cash on delivery" : ""}
                        </div>
                      </Td>
                      <Td label="Status">
                        <StatusPill
                          tone={toneForStatus(row.status)}
                          label={labelForStatus(row.status)}
                          live={ACTIVE_STATUSES.includes(row.status)}
                        />
                      </Td>
                      <Td label="Customer">
                        {row.customerName}
                        <div className="kf-list__meta">{row.customerPhone}</div>
                      </Td>
                      <Td label="Kitchen" muted>
                        {row.kitchenName}
                      </Td>
                      <Td label="Rider" muted>
                        {row.riderName ?? <span className="kf-muted">Nobody yet</span>}
                      </Td>
                      <Td label="Placed">
                        {/* The elapsed time for anything still moving, because
                            that is what is being scanned for; the timestamp once
                            it is history. */}
                        {ACTIVE_STATUSES.includes(row.status) ? (
                          <span className="kf-numeric">{elapsedSince(row.placedAt)}</span>
                        ) : (
                          <span className="kf-numeric">{formatDateTime(row.placedAt)}</span>
                        )}
                      </Td>
                      <Td numeric label="Total">
                        <Money value={formatNaira(row.totalKobo)} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </CardBody>
      </Card>

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        pageSize={result.pageSize}
        hrefFor={(page) => `/admin/orders${queryFor(search, { page })}`}
      />
    </Stack>
  );
}
