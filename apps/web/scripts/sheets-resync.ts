/**
 * Re-send a date range of orders and settlements to the Google Sheets web app.
 *
 * This is the catch-up path. The live sync is fire-and-forget: when the web app
 * is down, a row is skipped and logged, and there is deliberately no in-memory
 * queue to hold it, because an in-memory queue is a promise a serverless
 * deployment cannot keep. What makes this a catch-up rather than a second copy is
 * the row key: the Apps Script upserts on it, so re-sending an order that already
 * reached the sheet rewrites that row instead of appending another.
 *
 *   npm run sheets-resync -- --from 2026-10-01 --to 2026-10-25
 *   npm run sheets-resync -- --from 2026-10-01 --to 2026-10-25 --kind settlement
 *   npm run sheets-resync -- --from 2026-10-01 --to 2026-10-25 --batch 100
 *
 * The range is read in Lagos days, end inclusive, the way every other date in
 * this application is read: a bare date parsed as UTC midnight would start the
 * range at 1am in Kano and miss the last hour of the previous night.
 *
 * Both ends are walked. Orders are selected by when they were placed, because
 * that is the trading day an operator reports on. Settlements are selected by
 * whether their period overlaps the range at all, because a settlement covers a
 * window rather than an instant and half of them end after the day they were
 * created.
 *
 * It reads only: no database write, no schema change. Rows go out through the
 * same `postSheetRows` the live path uses, so there is one definition of the
 * contract rather than a second one here that would eventually disagree.
 *
 * Nothing is sent while the sync is off or unconfigured. That is a refusal with a
 * message rather than a silent no-op, because a person ran this on purpose.
 */

import { parseArgs } from "node:util";

import { prisma } from "@kanofood/db";

import { lagosDayFromInput } from "../lib/admin/status.ts";
import {
  orderSheetRow,
  postSheetRows,
  settlementSheetRow,
  type SheetKind,
  type SheetRow,
} from "../lib/sheets/sync.ts";

const USAGE = [
  "Give a range: --from YYYY-MM-DD --to YYYY-MM-DD",
  "  --kind   order | settlement | all   (default: all)",
  "  --batch  rows per request           (default: 50)",
].join("\n");

const { values } = parseArgs({
  options: {
    from: { type: "string" },
    to: { type: "string" },
    kind: { type: "string" },
    batch: { type: "string" },
  },
  allowPositionals: false,
});

const kind = (values.kind ?? "all").trim().toLowerCase();
if (kind !== "all" && kind !== "order" && kind !== "settlement") {
  console.error(`--kind takes order, settlement or all, not "${values.kind ?? ""}".`);
  process.exit(1);
}

const from = values.from ? lagosDayFromInput(values.from, "start") : null;
const toEnd = values.to ? lagosDayFromInput(values.to, "end") : null;
if (!from || !toEnd) {
  console.error(USAGE);
  process.exit(1);
}
if (toEnd < from) {
  console.error("The end of the range is before its start.");
  process.exit(1);
}
// Named rather than read from `from` below, because a narrowing does not travel
// into the helper functions.
const startAt: Date = from;
// The last day is inclusive, so the upper bound is the instant after its final
// millisecond. Half-open at the top is the convention every range in this
// codebase uses, and it is what stops the closing day being counted twice.
const before = new Date(toEnd.getTime() + 1);

const batch = Math.min(Math.max(Number(values.batch ?? 50) || 50, 1), 200);

interface Tally {
  rows: number;
  sent: number;
  failed: number;
}

async function send(
  sheetKind: SheetKind,
  label: string,
  rows: readonly SheetRow[],
  tally: Tally,
): Promise<void> {
  if (rows.length === 0) return;

  tally.rows += rows.length;
  try {
    await postSheetRows(sheetKind, rows);
    tally.sent += rows.length;
  } catch (error) {
    // One line per failed batch, and the run continues: a range is usually
    // several batches, and stopping at the first refusal would leave the rest
    // unsent for a reason that may be transient.
    tally.failed += rows.length;
    console.error(`${label}: ${rows.length} rows refused — ${reason(error)}`);
  }
}

/** Walk one kind, one page of ids at a time, one builder per id. */
async function walk(
  sheetKind: SheetKind,
  label: string,
  ids: readonly string[],
  build: (id: string) => Promise<SheetRow | null>,
  tally: Tally,
): Promise<void> {
  const rows: SheetRow[] = [];
  for (const id of ids) {
    const row = await build(id);
    if (row) rows.push(row);
    if (rows.length === batch) {
      await send(sheetKind, label, rows.splice(0, rows.length), tally);
    }
  }
  await send(sheetKind, label, rows, tally);
}

async function orderIds(): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;

  for (;;) {
    const page: { id: string }[] = await prisma.order.findMany({
      where: { placedAt: { gte: startAt, lt: before } },
      orderBy: { id: "asc" },
      take: batch,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true },
    });

    for (const row of page) ids.push(row.id);
    const last = page.at(-1);
    if (page.length < batch || !last) return ids;
    cursor = last.id;
  }
}

async function settlementIds(): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;

  for (;;) {
    const page: { id: string }[] = await prisma.kitchenSettlement.findMany({
      where: { periodStart: { lt: before }, periodEnd: { gt: startAt } },
      orderBy: { id: "asc" },
      take: batch,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true },
    });

    for (const row of page) ids.push(row.id);
    const last = page.at(-1);
    if (page.length < batch || !last) return ids;
    cursor = last.id;
  }
}

async function main(): Promise<void> {
  console.log(
    `Resending ${kind === "all" ? "orders and settlements" : `${kind}s`} ` +
      `${values.from} to ${values.to}, ${batch} rows per request.`,
  );

  const orders: Tally = { rows: 0, sent: 0, failed: 0 };
  const settlements: Tally = { rows: 0, sent: 0, failed: 0 };

  if (kind === "all" || kind === "order") {
    const ids = await orderIds();
    await walk("order", "orders", ids, orderSheetRow, orders);
  }
  if (kind === "all" || kind === "settlement") {
    const ids = await settlementIds();
    await walk("settlement", "settlements", ids, settlementSheetRow, settlements);
  }

  if (kind === "all" || kind === "order") console.log(tallyLine("orders", orders));
  if (kind === "all" || kind === "settlement") console.log(tallyLine("settlements", settlements));

  const failed = orders.failed + settlements.failed;
  if (failed > 0) {
    console.error(`${failed} rows did not reach the sheet. Re-run the same range to retry them.`);
    process.exitCode = 1;
  }
}

function tallyLine(label: string, tally: Tally): string {
  return `  ${label.padEnd(12)} ${tally.sent} sent, ${tally.failed} failed, ${tally.rows} walked`;
}

function reason(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").slice(0, 200);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
