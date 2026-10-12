import { prisma } from "@kanofood/db";

import { ApiError } from "../api/http";
import { audit, snapshot } from "./audit";
import { lagosDayStart } from "./status";
import type { OrderActor } from "./orders";

/**
 * Cash and reconciliation. Screen 7.8.
 *
 * Two ledgers describe the same money and they are not the same ledger:
 *
 * - `payments` says what was collected against an order. Its status runs
 *   `pending` → `collected` → `reconciled`.
 * - `cash_collections` says what a rider is holding. Its status runs
 *   `pending` → `handed_over` → `received`.
 *
 * **They share no key.** A cash collection carries a rider and an amount and
 * nothing else: no order, no payment. So a handover cannot be traced to the
 * orders it settled, and the two ledgers can disagree without either being
 * wrong. That is a schema decision made in Phase 2 and it is not something the
 * admin interface can repair, so this screen reports both rather than pretending
 * one is derived from the other. It is listed with the other spec gaps.
 *
 * What the screen is for, in the operator's words: how much cash is out with
 * riders right now, and which of it is late.
 */
export interface CashCollectionRow {
  readonly id: string;
  readonly riderId: string;
  readonly riderName: string;
  readonly amountKobo: bigint;
  readonly status: string;
  readonly collectedAt: Date;
  readonly handedOverAt: Date | null;
  readonly receivedBy: string | null;
  readonly notes: string | null;
  readonly ageHours: number;
}

export interface CashBoard {
  /** Everything not yet counted, oldest first: the work queue. */
  readonly pending: readonly CashCollectionRow[];
  readonly pendingTotalKobo: bigint;
  readonly handedOverKobo: bigint;
  readonly receivedTodayKobo: bigint;
  readonly unreconciled: readonly UnreconciledPaymentRow[];
  readonly unreconciledTotalKobo: bigint;
  readonly collectedTodayKobo: bigint;
}

export interface UnreconciledPaymentRow {
  readonly id: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly method: string;
  readonly amountKobo: bigint;
  readonly collectedAt: Date | null;
  readonly collectedBy: string | null;
  readonly kitchenName: string;
}

export async function loadCashBoard(now: Date = new Date()): Promise<CashBoard> {
  const since = lagosDayStart(now);

  const [collections, receivedToday, payments, collectedToday] = await Promise.all([
    // Only what is still outstanding. A received collection is history, and the
    // history is the settlements screen's job, not this one's.
    prisma.cashCollection.findMany({
      where: { status: { in: ["pending", "handed_over"] } },
      orderBy: { collectedAt: "asc" },
      select: {
        id: true,
        riderId: true,
        amountKobo: true,
        status: true,
        collectedAt: true,
        handedOverAt: true,
        notes: true,
        rider: { select: { name: true } },
        receivedByUser: { select: { name: true } },
      },
    }),
    prisma.cashCollection.aggregate({
      where: { status: "received", handedOverAt: { gte: since } },
      _sum: { amountKobo: true },
    }),
    prisma.payment.findMany({
      where: { status: "collected" },
      orderBy: { collectedAt: "asc" },
      select: {
        id: true,
        method: true,
        amountKobo: true,
        collectedAt: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            kitchen: { select: { name: true } },
          },
        },
        collectedByRider: { select: { name: true } },
      },
    }),
    prisma.payment.aggregate({
      where: { status: { in: ["collected", "reconciled"] }, collectedAt: { gte: since } },
      _sum: { amountKobo: true },
    }),
  ]);

  const rows: CashCollectionRow[] = collections.map((collection) => ({
    id: collection.id,
    riderId: collection.riderId,
    riderName: collection.rider.name,
    amountKobo: collection.amountKobo,
    status: collection.status,
    collectedAt: collection.collectedAt,
    handedOverAt: collection.handedOverAt,
    receivedBy: collection.receivedByUser?.name ?? null,
    notes: collection.notes,
    ageHours: Math.max(
      0,
      Math.floor((now.getTime() - collection.collectedAt.getTime()) / 3_600_000),
    ),
  }));

  let pendingTotalKobo = 0n;
  let handedOverKobo = 0n;
  for (const row of rows) {
    if (row.status === "handed_over") handedOverKobo += row.amountKobo;
    else pendingTotalKobo += row.amountKobo;
  }

  const unreconciled: UnreconciledPaymentRow[] = payments.map((payment) => ({
    id: payment.id,
    orderId: payment.order.id,
    orderNumber: payment.order.orderNumber,
    method: payment.method,
    amountKobo: payment.amountKobo,
    collectedAt: payment.collectedAt,
    collectedBy: payment.collectedByRider?.name ?? null,
    kitchenName: payment.order.kitchen.name,
  }));

  let unreconciledTotalKobo = 0n;
  for (const payment of unreconciled) unreconciledTotalKobo += payment.amountKobo;

  return {
    pending: rows,
    pendingTotalKobo,
    handedOverKobo,
    receivedTodayKobo: receivedToday._sum.amountKobo ?? 0n,
    unreconciled,
    unreconciledTotalKobo,
    collectedTodayKobo: collectedToday._sum.amountKobo ?? 0n,
  };
}

// ---------------------------------------------------------------------------
// Cash writes
// ---------------------------------------------------------------------------

/**
 * The rider has said they are handing the money over.
 *
 * Only the rider's own interface should call this. It exists here rather than
 * only in the rider routes because an operator recording a handover phoned in
 * is a real thing on a bad day, and the alternative is that they edit the
 * database.
 */
export async function markCashHandedOver(input: {
  readonly collectionId: string;
  readonly notes?: string | null;
  readonly actor: OrderActor;
}): Promise<void> {
  const before = await prisma.cashCollection.findUnique({
    where: { id: input.collectionId },
    select: { id: true, status: true, amountKobo: true, riderId: true, notes: true },
  });
  if (!before) throw ApiError.notFound("That cash record no longer exists.");
  if (before.status !== "pending") {
    throw ApiError.conflict(
      before.status === "received"
        ? "That handover has already been counted and received."
        : "That handover is already marked as handed over.",
    );
  }

  const at = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.cashCollection.update({
      where: { id: input.collectionId },
      data: {
        status: "handed_over",
        handedOverAt: at,
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      },
    });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "cash.handed_over",
        entityType: "cash_collection",
        entityId: input.collectionId,
        before: snapshot({ status: before.status }),
        after: { status: "handed_over", handedOverAt: at.toISOString() },
      },
      tx,
    );
  });
}

/**
 * The money has been counted and is with the platform.
 *
 * The count is not recorded, only the fact of it: `cash_collections` has one
 * amount column and it was written when the rider collected. If a handover is
 * short, the honest record is that the collection was received with a note
 * saying so, not a second amount that quietly disagrees with the first. A
 * discrepancy is a thing to see, not a thing to overwrite.
 */
export async function receiveCash(input: {
  readonly collectionId: string;
  readonly notes?: string | null;
  readonly actor: OrderActor;
}): Promise<void> {
  const before = await prisma.cashCollection.findUnique({
    where: { id: input.collectionId },
    select: {
      id: true,
      status: true,
      amountKobo: true,
      handedOverAt: true,
      riderId: true,
      notes: true,
      rider: { select: { name: true } },
    },
  });
  if (!before) throw ApiError.notFound("That cash record no longer exists.");
  if (before.status === "received") {
    throw ApiError.conflict("That cash has already been received.");
  }

  const at = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.cashCollection.update({
      where: { id: input.collectionId },
      data: {
        status: "received",
        // A rider who hands money straight to the office never presses the
        // button in their own interface, so the handover time is filled in here
        // rather than left null on a collection that is demonstrably over.
        handedOverAt: before.handedOverAt ?? at,
        receivedByUserId: input.actor.userId,
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      },
    });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "cash.received",
        entityType: "cash_collection",
        entityId: input.collectionId,
        before: snapshot({ status: before.status }),
        after: {
          status: "received",
          amountKobo: before.amountKobo.toString(),
          rider: before.rider.name,
        },
      },
      tx,
    );
  });
}

/**
 * Record an order payment as reconciled.
 *
 * Reconciliation is the platform agreeing that the money it expected against an
 * order is the money it has. It is per payment and per order, which is what
 * makes it different from receiving a rider's float.
 */
export async function reconcilePayment(input: {
  readonly paymentId: string;
  readonly actor: OrderActor;
}): Promise<void> {
  const before = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    select: {
      id: true,
      status: true,
      method: true,
      amountKobo: true,
      collectedAt: true,
      order: { select: { orderNumber: true } },
    },
  });
  if (!before) throw ApiError.notFound("That payment no longer exists.");

  if (before.status === "reconciled") {
    throw ApiError.conflict("That payment has already been reconciled.");
  }
  if (before.status === "pending") {
    throw ApiError.conflict(
      "Nothing has been collected against that payment yet, so there is nothing to reconcile.",
    );
  }
  if (before.status === "failed") {
    throw ApiError.conflict("That payment failed. There is nothing to reconcile.");
  }

  const at = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: input.paymentId },
      data: {
        status: "reconciled",
        reconciledAt: at,
        reconciledByUserId: input.actor.userId,
      },
    });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "payment.reconciled",
        entityType: "payment",
        entityId: input.paymentId,
        before: snapshot({ status: before.status }),
        after: {
          status: "reconciled",
          orderNumber: before.order.orderNumber,
          method: before.method,
          amountKobo: before.amountKobo.toString(),
          reconciledAt: at.toISOString(),
        },
      },
      tx,
    );
  });
}

/**
 * Reconcile every payment in one action.
 *
 * The list on screen 7.8 is worked through in one sitting, and doing it one row
 * at a time is the difference between a five-minute job and a twenty-minute one.
 * Bounded at 200 so a mis-clicked "all" on a table that has grown unexpectedly
 * cannot hold a transaction open indefinitely.
 */
export async function reconcilePayments(input: {
  readonly paymentIds: readonly string[];
  readonly actor: OrderActor;
}): Promise<number> {
  const ids = [...new Set(input.paymentIds)].slice(0, 200);
  if (ids.length === 0) return 0;

  const at = new Date();

  return prisma.$transaction(async (tx) => {
    const result = await tx.payment.updateMany({
      where: { id: { in: ids }, status: "collected" },
      data: {
        status: "reconciled",
        reconciledAt: at,
        reconciledByUserId: input.actor.userId,
      },
    });

    if (result.count > 0) {
      await audit(
        {
          actorUserId: input.actor.userId,
          actorRole: "admin",
          action: "payment.reconciled_batch",
          entityType: "payment",
          entityId: ids.join(","),
          after: { count: result.count, reconciledAt: at.toISOString() },
        },
        tx,
      );
    }

    return result.count;
  });
}
