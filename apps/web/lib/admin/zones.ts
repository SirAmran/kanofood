import { prisma } from "@kanofood/db";

import { ApiError } from "../api/http";
import { audit, snapshot } from "./audit";
import type { OrderActor } from "./orders";

/**
 * Zones and delivery fees. Screen 7.7.
 *
 * Section 11 is explicit that no delivery fee exists in code: it is a row, and
 * changing it is an admin edit. This module is the only place those rows move.
 *
 * Zones are never deleted. `orders` does not reference a zone directly, but the
 * fee a customer was charged was decided by one, and a zone that disappears
 * takes with it the only explanation of why a historical order cost what it
 * cost. A zone that is no longer served is switched off.
 */

export interface FeeRuleRow {
  readonly id: string;
  readonly minKm: string;
  readonly maxKm: string;
  readonly feeKobo: bigint;
}

export interface ZoneRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly isActive: boolean;
  readonly priority: number;
  readonly paymentRequirement: string;
  readonly baseFeeKobo: bigint;
  readonly rules: readonly FeeRuleRow[];
}

export async function listZones(): Promise<readonly ZoneRow[]> {
  const zones = await prisma.deliveryZone.findMany({
    include: { feeRules: { orderBy: { minKm: "asc" } } },
    orderBy: [{ priority: "desc" }, { name: "asc" }],
  });

  return zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    slug: zone.slug,
    isActive: zone.isActive,
    priority: zone.priority,
    paymentRequirement: zone.paymentRequirement,
    baseFeeKobo: zone.baseFeeKobo,
    // A Decimal reaches the page as a string rather than a number, because the
    // column is `Decimal(6,2)` and turning it into a float to display it would
    // be the one place in this codebase a distance could acquire a rounding
    // error.
    rules: zone.feeRules.map((rule) => ({
      id: rule.id,
      minKm: rule.minKm.toFixed(2),
      maxKm: rule.maxKm.toFixed(2),
      feeKobo: rule.feeKobo,
    })),
  }));
}

export function slugifyZone(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Kilometres arrive as a typed string, for example "3" or "3.5". */
function parseKm(value: string, label: string): number {
  const trimmed = value.trim();
  if (trimmed === "") throw ApiError.badRequest(`${label} is required.`);

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) throw ApiError.badRequest(`${label} must be a number.`);
  if (parsed < 0) throw ApiError.badRequest(`${label} cannot be negative.`);
  if (parsed > 9999.99) throw ApiError.badRequest(`${label} is implausibly large.`);

  // Two decimal places is what the column holds. Rounding here rather than
  // letting Postgres do it means the row that is read back is the row that was
  // written.
  return Math.round(parsed * 100) / 100;
}

export interface ZoneInput {
  readonly name: string;
  readonly slug?: string;
  /** GeoJSON. Accepted as written; nothing here interprets the geometry. */
  readonly boundary?: unknown;
  readonly baseFeeKobo: bigint;
  readonly paymentRequirement: "cod_allowed" | "prepaid_required";
  readonly priority?: number;
  readonly isActive?: boolean;
}

export async function createZone(input: {
  readonly zone: ZoneInput;
  readonly actor: OrderActor;
}): Promise<string> {
  const name = input.zone.name.trim();
  if (name === "") throw ApiError.badRequest("A zone needs a name.");

  const slug = (input.zone.slug?.trim() || slugifyZone(name)).toLowerCase();
  if (slug === "") {
    throw ApiError.badRequest("That name does not make a usable slug. Give one explicitly.");
  }

  const taken = await prisma.deliveryZone.findUnique({ where: { slug }, select: { id: true } });
  if (taken) throw ApiError.conflict(`The slug "${slug}" is already on another zone.`);

  return prisma.$transaction(async (tx) => {
    const zone = await tx.deliveryZone.create({
      data: {
        name,
        slug,
        boundary: (input.zone.boundary ?? { type: "Polygon", coordinates: [] }) as never,
        baseFeeKobo: input.zone.baseFeeKobo,
        paymentRequirement: input.zone.paymentRequirement,
        priority: input.zone.priority ?? 0,
        isActive: input.zone.isActive ?? true,
      },
    });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "zone.created",
        entityType: "delivery_zone",
        entityId: zone.id,
        after: { name, slug, baseFeeKobo: zone.baseFeeKobo.toString() },
      },
      tx,
    );

    return zone.id;
  });
}

export interface ZonePatch {
  readonly name?: string;
  readonly baseFeeKobo?: bigint;
  readonly paymentRequirement?: "cod_allowed" | "prepaid_required";
  readonly priority?: number;
  readonly isActive?: boolean;
  readonly boundary?: unknown;
}

export async function updateZone(input: {
  readonly zoneId: string;
  readonly patch: ZonePatch;
  readonly actor: OrderActor;
}): Promise<void> {
  const before = await prisma.deliveryZone.findUnique({ where: { id: input.zoneId } });
  if (!before) throw ApiError.notFound("That zone no longer exists.");

  const data: Record<string, unknown> = {};
  if (input.patch.name !== undefined) {
    const name = input.patch.name.trim();
    if (name === "") throw ApiError.badRequest("A zone needs a name.");
    data.name = name;
  }
  if (input.patch.baseFeeKobo !== undefined) data.baseFeeKobo = input.patch.baseFeeKobo;
  if (input.patch.paymentRequirement !== undefined) {
    data.paymentRequirement = input.patch.paymentRequirement;
  }
  if (input.patch.priority !== undefined) data.priority = input.patch.priority;
  if (input.patch.isActive !== undefined) data.isActive = input.patch.isActive;
  if (input.patch.boundary !== undefined) data.boundary = input.patch.boundary;

  if (Object.keys(data).length === 0) return;

  await prisma.$transaction(async (tx) => {
    const after = await tx.deliveryZone.update({ where: { id: input.zoneId }, data });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "zone.updated",
        entityType: "delivery_zone",
        entityId: input.zoneId,
        before: snapshot({
          name: before.name,
          baseFeeKobo: before.baseFeeKobo.toString(),
          paymentRequirement: before.paymentRequirement,
          priority: before.priority,
          isActive: before.isActive,
        }),
        after: snapshot({
          name: after.name,
          baseFeeKobo: after.baseFeeKobo.toString(),
          paymentRequirement: after.paymentRequirement,
          priority: after.priority,
          isActive: after.isActive,
        }),
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Fee tiers
// ---------------------------------------------------------------------------

/**
 * The tiers must tile without a gap or an overlap.
 *
 * A gap is a distance the platform cannot price, and an overlap is a distance it
 * can price two ways. Neither shows up until a customer at that distance tries
 * to order, and by then the fee is being invented by whichever row the database
 * returned first. So they are refused at the point of writing rather than
 * discovered at the point of ordering.
 */
async function assertTiers(input: {
  readonly zoneId: string;
  readonly minKm: number;
  readonly maxKm: number;
  /** The rule being edited, excluded from the clash check. */
  readonly exceptRuleId?: string;
}): Promise<void> {
  if (input.maxKm <= input.minKm) {
    throw ApiError.badRequest("The upper distance must be greater than the lower one.");
  }

  const siblings = await prisma.deliveryFeeRule.findMany({
    where: {
      zoneId: input.zoneId,
      ...(input.exceptRuleId ? { id: { not: input.exceptRuleId } } : {}),
    },
    select: { id: true, minKm: true, maxKm: true },
  });

  for (const sibling of siblings) {
    const siblingMin = Number(sibling.minKm);
    const siblingMax = Number(sibling.maxKm);

    // Touching edges are fine: 0-3 and 3-5 tile. Overlapping is not.
    const overlaps = input.minKm < siblingMax && input.maxKm > siblingMin;
    if (overlaps) {
      throw ApiError.conflict(
        `That overlaps the existing ${siblingMin}-${siblingMax} km tier. Tiers cannot overlap.`,
      );
    }
  }
}

export async function createFeeRule(input: {
  readonly zoneId: string;
  readonly minKm: string;
  readonly maxKm: string;
  readonly feeKobo: bigint;
  readonly actor: OrderActor;
}): Promise<string> {
  const zone = await prisma.deliveryZone.findUnique({
    where: { id: input.zoneId },
    select: { id: true, name: true },
  });
  if (!zone) throw ApiError.notFound("That zone no longer exists.");

  const minKm = parseKm(input.minKm, "The lower distance");
  const maxKm = parseKm(input.maxKm, "The upper distance");
  await assertTiers({ zoneId: input.zoneId, minKm, maxKm });

  return prisma.$transaction(async (tx) => {
    const rule = await tx.deliveryFeeRule.create({
      data: { zoneId: input.zoneId, minKm, maxKm, feeKobo: input.feeKobo },
    });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "fee_rule.created",
        entityType: "delivery_fee_rule",
        entityId: rule.id,
        after: {
          zone: zone.name,
          minKm: rule.minKm.toFixed(2),
          maxKm: rule.maxKm.toFixed(2),
          feeKobo: rule.feeKobo.toString(),
        },
      },
      tx,
    );

    return rule.id;
  });
}

export async function updateFeeRule(input: {
  readonly ruleId: string;
  readonly minKm: string;
  readonly maxKm: string;
  readonly feeKobo: bigint;
  readonly actor: OrderActor;
}): Promise<void> {
  const before = await prisma.deliveryFeeRule.findUnique({ where: { id: input.ruleId } });
  if (!before) throw ApiError.notFound("That fee tier no longer exists.");

  const minKm = parseKm(input.minKm, "The lower distance");
  const maxKm = parseKm(input.maxKm, "The upper distance");
  await assertTiers({ zoneId: before.zoneId, minKm, maxKm, exceptRuleId: input.ruleId });

  await prisma.$transaction(async (tx) => {
    const after = await tx.deliveryFeeRule.update({
      where: { id: input.ruleId },
      data: { minKm, maxKm, feeKobo: input.feeKobo },
    });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "fee_rule.updated",
        entityType: "delivery_fee_rule",
        entityId: input.ruleId,
        before: snapshot({
          minKm: before.minKm.toFixed(2),
          maxKm: before.maxKm.toFixed(2),
          feeKobo: before.feeKobo.toString(),
        }),
        after: snapshot({
          minKm: after.minKm.toFixed(2),
          maxKm: after.maxKm.toFixed(2),
          feeKobo: after.feeKobo.toString(),
        }),
      },
      tx,
    );
  });
}

/**
 * Remove a fee tier.
 *
 * Safe to delete, unlike a zone: a tier is a price for a distance, and orders
 * never reference one. What a customer paid is in `orders.delivery_fee_kobo`.
 * The last tier in a zone is refused, though, because a zone with no tiers
 * cannot price anything and the zone would look configured while being unable
 * to quote a fee.
 */
export async function deleteFeeRule(input: {
  readonly ruleId: string;
  readonly actor: OrderActor;
}): Promise<void> {
  const before = await prisma.deliveryFeeRule.findUnique({
    where: { id: input.ruleId },
    select: { id: true, zoneId: true, minKm: true, maxKm: true, feeKobo: true },
  });
  if (!before) throw ApiError.notFound("That fee tier no longer exists.");

  const remaining = await prisma.deliveryFeeRule.count({
    where: { zoneId: before.zoneId, id: { not: before.id } },
  });
  if (remaining === 0) {
    throw ApiError.conflict(
      "That is the last tier in this zone. A zone with no tiers cannot price a delivery.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.deliveryFeeRule.delete({ where: { id: input.ruleId } });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "fee_rule.deleted",
        entityType: "delivery_fee_rule",
        entityId: input.ruleId,
        before: snapshot({
          minKm: before.minKm.toFixed(2),
          maxKm: before.maxKm.toFixed(2),
          feeKobo: before.feeKobo.toString(),
        }),
      },
      tx,
    );
  });
}
