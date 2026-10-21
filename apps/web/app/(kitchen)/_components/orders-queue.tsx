"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ORDER_STATUS_LABELS } from "@kanofood/core";
import type { OrderStatus } from "@kanofood/core";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Cluster,
  EmptyState,
  Money,
  Spread,
  Stack,
  StatusPill,
  Table,
  TableWrap,
  Td,
  Th,
} from "@kanofood/ui";

import { formatNaira } from "@kanofood/core";
import { elapsedSince, toneForStatus } from "@/lib/admin/status";

/**
 * The live order queue. Screen 5.3 in docs/UX_SPEC.md.
 *
 * A client component because the point of the screen is that it stays current
 * while nobody is touching it. It polls the tab it is showing every fifteen
 * seconds, and immediately when the tab regains focus, which is the case that
 * matters: a phone that sat in someone's pocket through lunch comes back to the
 * right list rather than to whatever was there when the screen dimmed.
 *
 * Fifteen seconds is a deliberate middle. Faster achieves nothing the kitchen
 * can act on, because an order is not cooked in the interval between two polls;
 * slower means an order can sit unaccepted for half a minute after someone is
 * already looking at the screen.
 *
 * The counts are returned with every list, so the tab strip stays true without a
 * second request and without the client counting rows it does not have.
 */

const TABS = [
  { key: "new", label: "New" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "completed", label: "Completed" },
] as const;

type Tab = (typeof TABS)[number]["key"];

interface QueueRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly totalKobo: string;
  readonly placedAt: string;
  readonly customerName: string;
  readonly deliveryArea: string;
  readonly items: readonly { readonly name: string; readonly quantity: number }[];
}

interface QueueData {
  readonly tab: Tab;
  readonly counts: Readonly<Record<Tab, number>>;
  readonly total: number;
  readonly rows: readonly QueueRow[];
}

const POLL_MS = 15_000;

function summary(items: QueueRow["items"]): string {
  return items.map((item) => `${String(item.quantity)} x ${item.name}`).join(", ");
}

export function OrdersQueue({ initialTab = "new" }: { readonly initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [data, setData] = useState<QueueData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);

  // The tab currently on screen, readable from the interval without making it a
  // dependency that tears the timer down on every tab change.
  const tabRef = useRef<Tab>(tab);
  tabRef.current = tab;

  const load = useCallback(async (target: Tab, signal?: AbortSignal) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/kitchen/orders?tab=${target}`, {
        cache: "no-store",
        signal,
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: QueueData;
        error?: { message?: string };
      };

      if (!response.ok || !payload.ok || !payload.data) {
        setError(payload.error?.message ?? "Could not load the queue.");
        return;
      }

      // A response for a tab that is no longer open must not overwrite the one
      // on screen, which is what a slow request racing a tap looks like.
      if (payload.data.tab !== tabRef.current) return;

      setData(payload.data);
      setError(null);
      setUpdatedAt(new Date());
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError("Could not reach the server. Retrying automatically.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(tab, controller.signal);

    const timer = window.setInterval(() => {
      void load(tabRef.current, controller.signal);
    }, POLL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") void load(tabRef.current, controller.signal);
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, tab]);

  return (
    <Stack>
      {error ? <Alert tone="warning">{error}</Alert> : null}

      <Cluster>
        {TABS.map((option) => (
          <Button
            key={option.key}
            type="button"
            size="sm"
            variant={tab === option.key ? "primary" : "secondary"}
            onClick={() => setTab(option.key)}
          >
            {option.label}
            {data ? ` (${String(data.counts[option.key])})` : ""}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          loading={busy}
          onClick={() => void load(tabRef.current)}
        >
          Refresh
        </Button>
        {updatedAt ? (
          <span className="kf-muted">
            Updated {updatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </span>
        ) : null}
      </Cluster>

      <Card>
        <CardHeader
          title={TABS.find((option) => option.key === tab)?.label ?? "Orders"}
          action={
            data ? (
              <span className="kf-muted">
                {data.total === 1 ? "1 order" : `${String(data.total)} orders`}
              </span>
            ) : null
          }
        />
        <CardBody flush>
          {!data ? (
            <EmptyState title="Loading">Fetching this kitchen&apos;s orders.</EmptyState>
          ) : data.rows.length === 0 ? (
            <EmptyState title="Nothing here">
              {tab === "new"
                ? "No confirmed order is waiting. When one arrives it appears here on its own."
                : "No orders in this state."}
            </EmptyState>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Contents</Th>
                    <Th>Where</Th>
                    <Th>Status</Th>
                    <Th>Waiting</Th>
                    <Th numeric>Total</Th>
                    <Th>
                      <span className="kf-visually-hidden">Open</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id}>
                      <Td label="Order">
                        <Link href={`/kitchen/orders/${row.id}`} className="kf-list__title">
                          {row.orderNumber}
                        </Link>
                        <div className="kf-list__meta">{row.customerName}</div>
                      </Td>
                      <Td label="Contents">{summary(row.items)}</Td>
                      <Td label="Where" muted>
                        {row.deliveryArea || "No address on file"}
                      </Td>
                      <Td label="Status">
                        <StatusPill
                          tone={toneForStatus(row.status)}
                          label={ORDER_STATUS_LABELS[row.status]}
                        />
                      </Td>
                      <Td label="Waiting">
                        <span className="kf-numeric">{elapsedSince(new Date(row.placedAt))}</span>
                      </Td>
                      <Td numeric label="Total">
                        <Money value={formatNaira(BigInt(row.totalKobo))} />
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

      <Spread>
        <Badge tone="neutral">
          Refreshes every {String(POLL_MS / 1000)} seconds while this screen is open
        </Badge>
      </Spread>
    </Stack>
  );
}
