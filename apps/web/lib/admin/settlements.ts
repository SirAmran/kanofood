import {
  computeSettlement,
  isSettlementModel,
  parseRateToBasisPoints,
  settlementModelLabel,
} from "@kanofood/core";
import type { Kobo } from "@kanofood/core";
import { prisma } from "@kanofood/db";

import { ApiError } from "../api/http";
import { queueSettlementSheet } from "../sheets/sync";
import { audit, snapshot } from "./audit";
import { lagosDayStartDaysAgo } from "./status";
import type { OrderActor } from "./orders";

/**
 * Settlements. Screen 7.9.
 *
 * A settlement is what the platform owes one kitchen for one period. The three
 * figures on it come from `computeSettlement` in core and are never recomputed
 * here, because a settlement is a statement of what was agreed on a date and a
 * statement that changes when the inputs change is not a statement.
 *
 * **The period is measured by delivery, not by placement.** An order placed at
 * 11pm and delivered after midnight belongs to the day it was delivered, and the
 * reason is the payment model: the customer pays the rider on delivery, so the
 * money the kitchen is being paid out of arrives on that date. It also means a
 * closed period can never reopen, which is the property that makes the number on
 * a paid settlement worth anything.
 *
 * **Only DELIVERED orders count.** Not "everything except the failures" — an
 * order still in flight at the end of a period might yet be cancelled, and
 * settling it means clawing the money back afterwards. A delivered order is the
 * only order whose food was handed over.
 */

export interface SettlementRow {
  readonly id: string;
  readonly kitchenId: string;
  readonly kitchenName: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly grossKobo: Kobo;
  readonly commissionKobo: Kobo;
  readonly netPayableKobo: Kobo;
  readonly model: string;
  readonly status: string;
  readonly paidAt: Date | null;
  readonly paidBy: string | null;
  readonly reference: string | null;
  readonly createdAt: Date;
}

function label(model: string): string {
  return settlementModelLabel(isSettlementModel(model) ? model : "model_a");
}

export { label as settlementModelText };

export async function listSettlements(filters: {
  readonly status?: "pending" | "paid" | null;
  readonly kitchenId?: string | null;
}): Promise<readonly SettlementRow[]> {
  const settlements = await prisma.kitchenSettlement.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.kitchenId ? { kitchenId: filters.kitchenId } : {}),
    },
    orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      kitchenId: true,
      periodStart: true,
      periodEnd: true,
      grossKobo: true,
      commissionKobo: true,
      netPayableKobo: true,
      model: true,
      status: true,
      paidAt: true,
      reference: true,
      createdAt: true,
      kitchen: { select: { name: true } },
      paidByUser: { select: { name: true } },
    },
  });

  return settlements.map((settlement) => ({
    id: settlement.id,
    kitchenId: settlement.kitchenId,
    kitchenName: settlement.kitchen.name,
    periodStart: settlement.periodStart,
    periodEnd: settlement.periodEnd,
    grossKobo: settlement.grossKobo,
    commissionKobo: settlement.commissionKobo,
    netPayableKobo: settlement.netPayableKobo,
    model: settlement.model,
    status: settlement.status,
    paidAt: settlement.paidAt,
    paidBy: settlement.paidByUser?.name ?? null,
    reference: settlement.reference,
    createdAt: settlement.createdAt,
  }));
}

export interface SettlementDraft {
  readonly kitchenId: string;
  readonly kitchenName: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly orderCount: number;
  readonly grossKobo: Kobo;
  readonly commissionKobo: Kobo;
  readonly netPayableKobo: Kobo;
  readonly basisPoints: number;
  readonly commissionRate: string | null;
  /**
   * A settlement already covering part of this period, if there is one. Set
   * means this draft cannot be created as it stands.
   */
  readonly blockedBy: { readonly id: string; readonly periodStart: Date; readonly periodEnd: Date } | null;
}

/**
 * What a kitchen would be owed for an arbitrary period.
 *
 * Reads only. This is what the screen shows before anything is written, so an
 * operator sees the number before they commit to it.
 */
export async function draftSettlement(input: {
  readonly kitchenId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
}): Promise<SettlementDraft> {
  const kitchen = await prisma.kitchen.findUnique({
    where: { id: input.kitchenId },
    select: { id: true, name: true, commissionRate: true },
  });
  if (!kitchen) throw ApiError.notFound("That kitchen no longer exists.");

  const rate = kitchen.commissionRate === null ? null : kitchen.commissionRate.toFixed(4);

  // A kitchen with no rate set is zero, not an error. Section 1: kitchens join
  // free, so an unset rate and a zero rate mean the same thing and refusing to
  // draft a settlement over it would be refusing over nothing.
  const basisPoints = rate === null ? 0 : parseRateToBasisPoints(rate);

  const [totals, overlap] = await Promise.all([
    prisma.order.aggregate({
      where: {
        kitchenId: input.kitchenId,
        status: "DELIVERED",
        deliveredAt: { gte: input.periodStart, lt: input.periodEnd },
      },
      _sum: { subtotalKobo: true },
      _count: { _all: true },
    }),
    // Any settlement touching this window, whatever its status. A paid one
    // covers orders that were already paid for; a pending one is about to.
    prisma.kitchenSettlement.findFirst({
      where: {
        kitchenId: input.kitchenId,
        periodStart: { lt: input.periodEnd },
        periodEnd: { gt: input.periodStart },
      },
      select: { id: true, periodStart: true, periodEnd: true },
    }),
  ]);

  const figures = computeSettlement({
    grossKobo: totals._sum.subtotalKobo ?? 0n,
    basisPoints,
  });

  return {
    kitchenId: kitchen.id,
    kitchenName: kitchen.name,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    orderCount: totals._count._all,
    grossKobo: figures.grossKobo,
    commissionKobo: figures.commissionKobo,
    netPayableKobo: figures.netPayableKobo,
    basisPoints,
    commissionRate: rate,
    blockedBy: overlap
      ? { id: overlap.id, periodStart: overlap.periodStart, periodEnd: overlap.periodEnd }
      : null,
  };
}

export interface SettlementSuggestion {
  readonly kitchenId: string;
  readonly kitchenName: string;
  readonly draft: SettlementDraft;
}

/**
 * What every active kitchen is owed for a window, most owed first.
 *
 * The default window is the seven days ending at the start of today, so the
 * current day is never partly settled: a kitchen paid at 2pm for a day that is
 * still running would need a second settlement for the same day.
 */
export async function settlementSuggestions(
  now: Date = new Date(),
): Promise<readonly SettlementSuggestion[]> {
  const periodEnd = lagosDayStartDaysAgo(0, now);
  const periodStart = lagosDayStartDaysAgo(7, now);

  const kitchens = await prisma.kitchen.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const drafts = await Promise.all(
    kitchens.map((kitchen) =>
      draftSettlement({ kitchenId: kitchen.id, periodStart, periodEnd }).catch(() => null),
    ),
  );

  return drafts
    .filter((draft): draft is SettlementDraft => draft !== null)
    .filter((draft) => draft.orderCount > 0)
    .map((draft) => ({
      kitchenId: draft.kitchenId,
      kitchenName: draft.kitchenName,
      draft,
    }))
    .sort((a, b) => (b.draft.netPayableKobo > a.draft.netPayableKobo ? 1 : -1));
}

export async function createSettlement(input: {
  readonly kitchenId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly model?: "model_a" | "model_b";
  readonly actor: OrderActor;
}): Promise<string> {
  if (input.periodEnd <= input.periodStart) {
    throw ApiError.badRequest("The end of the period must be after the start.");
  }

  const draft = await draftSettlement(input);

  if (draft.blockedBy) {
    throw ApiError.conflict(
      "That period overlaps a settlement this kitchen already has. Two settlements covering the same delivered order would pay for it twice.",
    );
  }
  if (draft.orderCount === 0) {
    throw ApiError.conflict(
      "No delivered orders in that period, so there is nothing to settle.",
    );
  }

  const model = input.model ?? "model_a";

  const settlementId = await prisma.$transaction(async (tx) => {
    const settlement = await tx.kitchenSettlement.create({
      data: {
        kitchenId: draft.kitchenId,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        grossKobo: draft.grossKobo,
        commissionKobo: draft.commissionKobo,
        netPayableKobo: draft.netPayableKobo,
        model,
        status: "pending",
      },
    });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "settlement.created",
        entityType: "kitchen_settlement",
        entityId: settlement.id,
        after: {
          kitchen: draft.kitchenName,
          periodStart: draft.periodStart.toISOString(),
          periodEnd: draft.periodEnd.toISOString(),
          orders: draft.orderCount,
          grossKobo: draft.grossKobo.toString(),
          commissionKobo: draft.commissionKobo.toString(),
          netPayableKobo: draft.netPayableKobo.toString(),
          model,
        },
      },
      tx,
    );

    return settlement.id;
  });

  // After the money is committed, never inside the transaction: a reporting web
  // app being slow or down must not be able to fail a settlement.
  queueSettlementSheet(settlementId);

  return settlementId;
}

export async function paySettlement(input: {
  readonly settlementId: string;
  readonly reference: string;
  readonly actor: OrderActor;
}): Promise<void> {
  const reference = input.reference.trim();
  if (reference === "") {
    throw ApiError.badRequest(
      "A payment needs a reference. It is the only thing that ties this row to the transfer.",
    );
  }

  const before = await prisma.kitchenSettlement.findUnique({
    where: { id: input.settlementId },
    select: {
      id: true,
      status: true,
      netPayableKobo: true,
      reference: true,
      kitchen: { select: { name: true } },
    },
  });
  if (!before) throw ApiError.notFound("That settlement no longer exists.");
  if (before.status === "paid") {
    throw ApiError.conflict("That settlement has already been paid.");
  }

  const at = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.kitchenSettlement.update({
      where: { id: input.settlementId },
      data: {
        status: "paid",
        paidAt: at,
        paidByUserId: input.actor.userId,
        reference,
      },
    });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "settlement.paid",
        entityType: "kitchen_settlement",
        entityId: input.settlementId,
        before: snapshot({ status: before.status }),
        after: {
          status: "paid",
          kitchen: before.kitchen.name,
          netPayableKobo: before.netPayableKobo.toString(),
          reference,
          paidAt: at.toISOString(),
        },
      },
      tx,
    );
  });
}

/**
 * Remove a settlement that has not been paid.
 *
 * A pending settlement is a statement nobody has acted on, and the common reason
 * to remove one is that the period was wrong. A paid settlement is not
 * removable at all and there is no "void" status to move it to: money left the
 * account, and the correction for a wrong paid settlement is a conversation and
 * a compensating entry, not a deleted row.
 */
export async function deleteSettlement(input: {
  readonly settlementId: string;
  readonly actor: OrderActor;
}): Promise<void> {
  const before = await prisma.kitchenSettlement.findUnique({
    where: { id: input.settlementId },
    select: {
      id: true,
      status: true,
      netPayableKobo: true,
      periodStart: true,
      periodEnd: true,
      kitchen: { select: { name: true } },
    },
  });
  if (!before) throw ApiError.notFound("That settlement no longer exists.");
  if (before.status === "paid") {
    throw ApiError.conflict(
      "That settlement has been paid. A paid settlement cannot be removed.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.kitchenSettlement.delete({ where: { id: input.settlementId } });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "settlement.deleted",
        entityType: "kitchen_settlement",
        entityId: input.settlementId,
        before: snapshot({
          kitchen: before.kitchen.name,
          periodStart: before.periodStart.toISOString(),
          periodEnd: before.periodEnd.toISOString(),
          netPayableKobo: before.netPayableKobo.toString(),
        }),
      },
      tx,
    );
  });
}
