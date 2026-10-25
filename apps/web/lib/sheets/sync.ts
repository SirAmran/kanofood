import { after } from "next/server.js";

import {
  ORDER_STATUS_LABELS,
  SETTLEMENT_MODEL_SHORT,
  isSettlementModel,
} from "@kanofood/core";
import type { OrderStatus } from "@kanofood/core";
import { prisma } from "@kanofood/db";

import { sheetsSyncEnabled, sheetsWebhookToken, sheetsWebhookUrl } from "../env.ts";

/**
 * The Google Sheets reporting sync. docs/ARCHITECTURE.md section 12.
 *
 * **Reporting only.** The sheet is somewhere an operator can pivot and share; it
 * is never a source of truth and nothing here reads from it. That is why a
 * failure in this module is a line in a log and nothing more: section 12 says an
 * order continues whether or not Sheets answers, so no path here may delay or
 * fail an order, a move or a settlement.
 *
 * **Apps Script, not the Sheets API.** A small web app (`docs/sheets/code.gs`)
 * holds the spreadsheet permission; this deployment holds one URL and one shared
 * token. That keeps the OAuth grant, the refresh token and the spreadsheet id
 * out of this codebase entirely.
 *
 * **Off unless switched on.** Disabled or unconfigured is the default state and
 * it is not a failure, so it produces nothing at all: no row, no log line, no
 * error. A sheet that has never been switched on should leave no trace.
 *
 * **The key is what makes a retry safe.** Every row carries `order:<uuid>` or
 * `settlement:<uuid>`, and the Apps Script upserts on it. So the same order can
 * be written on every move, a failed POST can be repeated, and the resync script
 * can walk a whole month without producing a second copy of anything. That is
 * also why there is no queue table here: a durable outbox would be a schema
 * change for a piece of reporting, and the script is the catch-up instead.
 *
 * **No personal data.** The sheet carries the order number, never the customer's
 * name or phone. A reporting copy is a second place for data to leak from, and
 * nothing in a pivot needs to know who ordered.
 *
 * The two import specifiers above look unusual and are deliberate: this module
 * is also imported by `scripts/sheets-resync.ts`, which runs under plain Node
 * rather than inside Next. `next/server.js` is the same module as `next/server`
 * (Next's own file says so) but is a real path, and `../env.ts` names the file
 * rather than leaving the extension out. Both are resolvable by Node and by the
 * bundler; the extensionless forms are not resolvable by Node.
 */

/** Abort a web app that has stopped answering. Ten seconds is generous for a script. */
const TIMEOUT_MS = 10_000;

/** The two things this module reports on. The Apps Script keys its sheets off these. */
export type SheetKind = "order" | "settlement";

/**
 * One row, as it crosses the wire.
 *
 * Column names are snake_case because they become the sheet's header row, and a
 * header an operator reads is not a TypeScript identifier. Values are strings
 * and integers: a sheet cell holding an object or an array is a cell nobody can
 * filter.
 */
export interface SheetRow {
  /** `order:<uuid>` or `settlement:<uuid>`. The upsert key on the other side. */
  readonly key: string;
  readonly [column: string]: string | number;
}

interface Target {
  readonly url: string;
  readonly token: string;
}

/**
 * Where a POST would go, or null when reporting is off.
 *
 * Null is the ordinary case, not an error, so it is a value rather than a throw:
 * every caller's answer to it is the same, which is to do nothing.
 */
function target(): Target | null {
  if (!sheetsSyncEnabled()) return null;

  const url = sheetsWebhookUrl();
  const token = sheetsWebhookToken();
  return url && token ? { url, token } : null;
}

/**
 * Ask for an order's sheet row without waiting for it.
 *
 * Called from `queueOrderStatus`, beside the notification dispatch, because both
 * hang off the same fact: the order moved. Scheduling is copied from there for
 * the same reason: `after()` runs once the response has been sent, so a slow or
 * absent web app costs the order nothing, and the `try` covers the script, seed
 * or test case where there is no request and `after` would throw. The fallback
 * runs the same work detached. Neither path throws at the caller.
 *
 * **The status argument is accepted and ignored.** `queueOrderStatus` has it to
 * hand and passing it costs nothing, but the row is built from the order as it is
 * read, not as it was at call time: this runs after the response and the order
 * may have moved again by then, and a row labelled with a stale status is worse
 * than one read a moment later. The upsert key makes the extra writes cheap and
 * the sheet always current.
 */
export function queueOrderSheet(orderId: string, _status?: OrderStatus): void {
  // Reporting off means nothing is scheduled at all, not a scheduled no-op.
  if (!target()) return;
  schedule(() => sendRow("order", orderId));
}

/** The same, for a settlement that has just been committed. Screen 7.9. */
export function queueSettlementSheet(settlementId: string): void {
  if (!target()) return;
  schedule(() => sendRow("settlement", settlementId));
}

function schedule(run: () => Promise<void>): void {
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Build the row, post it, and log at most one line if it did not land.
 *
 * Everything is caught here rather than in the caller because there is nowhere
 * up the stack that could do anything about it: the order is already committed
 * and the response already sent.
 */
async function sendRow(kind: SheetKind, id: string): Promise<void> {
  try {
    const row = kind === "order" ? await orderSheetRow(id) : await settlementSheetRow(id);
    // Only reachable if the order or settlement was deleted between the commit
    // and this read. There is nothing to report and nothing to say.
    if (!row) return;
    await postSheetRows(kind, [row]);
  } catch (error) {
    // One line, naming the thing that did not reach the sheet, and no payload or
    // stack: this is an operator's log, not a debugging session.
    console.error(`[sheets] ${kind} ${id} was not written: ${reason(error)}`);
  }
}

/**
 * POST rows to the Apps Script web app.
 *
 * Exported because the resync script is the catch-up path section 12 asks for,
 * and it must send exactly what the live path sends. Anything else is a second
 * definition of the contract, and the two would drift.
 *
 * Throws rather than swallowing: the live path catches and logs one line, and
 * the script wants the reason in its own output so an operator can act on it.
 * One POST carries many rows so a month of history is a handful of requests.
 */
export async function postSheetRows(
  kind: SheetKind,
  rows: readonly SheetRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const destination = target();
  if (!destination) {
    throw new Error(
      "The Sheets sync is off or not configured. It needs SHEETS_SYNC_ENABLED=true, " +
        "SHEETS_WEBHOOK_URL and SHEETS_WEBHOOK_TOKEN.",
    );
  }

  const response = await fetch(destination.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // The token travels in a header so it stays out of the URL, and therefore
      // out of any access log in front of the deployment.
      "x-sheets-token": destination.token,
    },
    // ...and again in the body, because `e.headers` is not part of Apps Script's
    // documented event object and a deployment that drops headers would otherwise
    // refuse every row. `docs/sheets/code.gs` accepts either and refuses without
    // one. Over HTTPS the second copy is not a second exposure.
    body: JSON.stringify({ kind, rows, token: destination.token }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`The web app answered ${String(response.status)}.`);
  }

  // Apps Script answers JSON from ContentService. A deployment that answers HTML
  // is a misconfigured one, and treating that as success would hide it.
  const answer = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
  } | null;
  if (!answer) throw new Error("The web app did not answer JSON.");
  if (answer.ok !== true) throw new Error(answer.error ?? "The web app refused the rows.");
}

/**
 * The order row.
 *
 * Money is integer kobo and only kobo. There is a naira formatter in core
 * (`formatNaira`), but it returns a display string with a currency sign, which
 * is a column nobody can sum; a reporting column that invents its own money
 * format is one that disagrees with the database. The sheet formats the kobo
 * column as currency in its own header if an operator wants it to.
 *
 * The delivery area is the zone slug recorded on the order's creating event.
 * The address snapshot also carries the landmark and the address text, and those
 * are the customer's address rather than an area, so they stay in the database.
 */
export async function orderSheetRow(orderId: string): Promise<SheetRow | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      status: true,
      createdAt: true,
      subtotalKobo: true,
      deliveryFeeKobo: true,
      totalKobo: true,
      paymentMethod: true,
      kitchen: { select: { name: true } },
      delivery: { select: { rider: { select: { name: true } } } },
      // The latest payment, which is the one that says whether the money arrived.
      payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      // The event that created the order, which is where the priced zone was
      // recorded. `fromStatus: null` is that event and only that event.
      events: { where: { fromStatus: null }, take: 1, select: { metadata: true } },
    },
  });
  if (!order) return null;

  const payment = order.payments[0];

  return {
    key: `order:${orderId}`,
    order_number: order.orderNumber,
    kitchen: order.kitchen.name,
    status: ORDER_STATUS_LABELS[order.status],
    created_at: order.createdAt.toISOString(),
    subtotal_kobo: kobo(order.subtotalKobo),
    delivery_fee_kobo: kobo(order.deliveryFeeKobo),
    total_kobo: kobo(order.totalKobo),
    payment_method: order.paymentMethod,
    // An order placed before the payment row exists, or a shape from an older
    // deployment, is "none" rather than blank: blank reads as "not asked".
    payment_status: payment?.status ?? "none",
    delivery_area: zoneSlug(order.events[0]?.metadata),
    rider: order.delivery?.rider.name ?? "",
  };
}

/**
 * The settlement row. Screen 7.9.
 *
 * The order count is deliberately absent: `kitchen_settlements` does not store
 * it, and recounting it here would be a second definition of "delivered inside
 * this period" living beside the one the figures were computed from.
 */
export async function settlementSheetRow(settlementId: string): Promise<SheetRow | null> {
  const settlement = await prisma.kitchenSettlement.findUnique({
    where: { id: settlementId },
    select: {
      periodStart: true,
      periodEnd: true,
      grossKobo: true,
      commissionKobo: true,
      netPayableKobo: true,
      model: true,
      status: true,
      paidAt: true,
      kitchen: { select: { name: true } },
    },
  });
  if (!settlement) return null;

  return {
    key: `settlement:${settlementId}`,
    kitchen: settlement.kitchen.name,
    period_start: settlement.periodStart.toISOString(),
    period_end: settlement.periodEnd.toISOString(),
    gross_kobo: kobo(settlement.grossKobo),
    commission_kobo: kobo(settlement.commissionKobo),
    net_payable_kobo: kobo(settlement.netPayableKobo),
    // "Model A", not the full sentence: the sheet is a column, and the sentence
    // is on the settlement screen for the person reading one settlement.
    model: isSettlementModel(settlement.model)
      ? SETTLEMENT_MODEL_SHORT[settlement.model]
      : settlement.model,
    status: settlement.status,
    // Blank until it is paid, which is the truth rather than a missing value.
    paid_at: settlement.paidAt?.toISOString() ?? "",
  };
}

/**
 * Kobo as a JSON integer.
 *
 * `money.ts` sends money as digit strings over the wire, because a JSON number is
 * a double and a response carrying a lifetime total can exceed 2^53. This is not
 * that: these are single order and settlement amounts (2^53 kobo is ninety
 * trillion naira), and this payload is not parsed by anything that does
 * arithmetic in floating point — it is written into a cell. A spreadsheet column
 * of text digits cannot be summed or pivoted, which is the only reason the sheet
 * exists, so the number is the honest form here.
 */
function kobo(amount: bigint): number {
  return Number(amount);
}

/** The zone the order was priced in, read off the creating event's metadata. */
function zoneSlug(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const value = (metadata as { zoneSlug?: unknown }).zoneSlug;
  return typeof value === "string" ? value : "";
}

/** A failure, as one log line's worth: no stack, no newlines, no payload. */
function reason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 200);
}
