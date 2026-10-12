import { prisma } from "@kanofood/db";

import { ApiError } from "../api/http";
import { hashPassword } from "../auth/password";
import { audit, snapshot } from "./audit";
import { lagosDayStart } from "./status";
import type { OrderActor } from "./orders";

/**
 * The network: the kitchens and the riders.
 *
 * Split out from the screens that read it because three of them do. The orders
 * filters need both lists to populate a dropdown, screens 7.5 and 7.6 need them
 * with their counters, and the cash screen needs the riders with theirs. A page
 * that queried its own dropdown options would be a fourth place the same select
 * lives.
 */

export interface Option {
  readonly id: string;
  readonly name: string;
}

/**
 * Every kitchen, active or not, because the orders filter must be able to find
 * an order placed at a kitchen that has since been closed.
 *
 * Ordered by name so the dropdown does not reshuffle between renders, and
 * active ones are not floated to the top: a list that reorders itself as
 * kitchens open and close is a list an operator has to re-read every time.
 */
export async function listKitchenOptions(): Promise<readonly Option[]> {
  return prisma.kitchen.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export interface RiderOption extends Option {
  readonly isActive: boolean;
  readonly isAvailable: boolean;
}

export async function listRiderOptions(): Promise<readonly RiderOption[]> {
  return prisma.rider.findMany({
    select: { id: true, name: true, isActive: true, isAvailable: true },
    orderBy: { name: "asc" },
  });
}

/** Riders who can actually be given an order. What the assign picker offers. */
export async function listAssignableRiders(): Promise<readonly RiderOption[]> {
  return prisma.rider.findMany({
    where: { isActive: true },
    select: { id: true, name: true, isActive: true, isAvailable: true },
    orderBy: { name: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Riders. Screen 7.6 in docs/UX_SPEC.md.
// ---------------------------------------------------------------------------

/**
 * The four states a rider is in, as one word.
 *
 * The two columns are genuinely independent and the list is unreadable without
 * collapsing them. `is_available` is the rider's own shift switch, `is_active`
 * is the platform's; whether they are currently carrying something is derived
 * from unfinished deliveries rather than stored, because a stored copy is a
 * stored copy that goes stale the moment a delivery ends.
 */
export type RiderState = "suspended" | "off-shift" | "on a delivery" | "available";

export interface RiderListRow {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly vehicle: string | null;
  readonly isActive: boolean;
  readonly isAvailable: boolean;
  readonly state: RiderState;
  readonly deliveriesToday: number;
  readonly inFlight: number;
  readonly cashInHandKobo: bigint;
  readonly cashHandedOverKobo: bigint;
}

function riderState(input: {
  isActive: boolean;
  isAvailable: boolean;
  inFlight: number;
}): RiderState {
  if (!input.isActive) return "suspended";
  if (input.inFlight > 0) return "on a delivery";
  return input.isAvailable ? "available" : "off-shift";
}

export async function listRiders(now: Date = new Date()): Promise<readonly RiderListRow[]> {
  const since = lagosDayStart(now);

  /**
   * Five queries for the whole table rather than five per rider.
   *
   * The cash figures come from `cash_collections`, not from `payments`, and the
   * difference matters: a payment row says what a rider collected, and a cash
   * collection row says what they are holding and whether it has reached the
   * platform. The float an operator cares about is the second one.
   */
  const [riders, deliveriesToday, inFlight, held, handed] = await Promise.all([
    prisma.rider.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        vehicle: true,
        isActive: true,
        isAvailable: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.delivery.groupBy({
      by: ["riderId"],
      where: { assignedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.delivery.groupBy({
      by: ["riderId"],
      where: { deliveredAt: null, failedAt: null },
      _count: { _all: true },
    }),
    prisma.cashCollection.groupBy({
      by: ["riderId"],
      where: { status: "pending" },
      _sum: { amountKobo: true },
    }),
    prisma.cashCollection.groupBy({
      by: ["riderId"],
      where: { status: { in: ["handed_over", "received"] } },
      _sum: { amountKobo: true },
    }),
  ]);

  const todayBy = new Map(deliveriesToday.map((row) => [row.riderId, row._count._all]));
  const flightBy = new Map(inFlight.map((row) => [row.riderId, row._count._all]));
  const heldBy = new Map(held.map((row) => [row.riderId, row._sum.amountKobo ?? 0n]));
  const handedBy = new Map(handed.map((row) => [row.riderId, row._sum.amountKobo ?? 0n]));

  return riders.map((rider) => {
    const flights = flightBy.get(rider.id) ?? 0;

    return {
      id: rider.id,
      name: rider.name,
      phone: rider.phone,
      vehicle: rider.vehicle,
      isActive: rider.isActive,
      isAvailable: rider.isAvailable,
      state: riderState({
        isActive: rider.isActive,
        isAvailable: rider.isAvailable,
        inFlight: flights,
      }),
      deliveriesToday: todayBy.get(rider.id) ?? 0,
      inFlight: flights,
      cashInHandKobo: heldBy.get(rider.id) ?? 0n,
      cashHandedOverKobo: handedBy.get(rider.id) ?? 0n,
    };
  });
}

export interface RiderDeliveryRow {
  readonly id: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly status: string;
  readonly assignedAt: Date;
  readonly deliveredAt: Date | null;
  readonly failedAt: Date | null;
  readonly totalKobo: bigint;
  /** Minutes from assignment to delivery, or null while it is unfinished. */
  readonly minutes: number | null;
}

export interface RiderDetail {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly phone: string;
  readonly vehicle: string | null;
  readonly isActive: boolean;
  readonly isAvailable: boolean;
  readonly state: RiderState;
  readonly email: string | null;
  readonly userIsActive: boolean;
  readonly deliveriesToday: number;
  readonly deliveredToday: number;
  readonly failedToday: number;
  readonly inFlight: number;
  readonly cashInHandKobo: bigint;
  readonly cashHandedOverKobo: bigint;
  readonly deliveries: readonly RiderDeliveryRow[];
}

export async function loadRider(
  id: string,
  now: Date = new Date(),
): Promise<RiderDetail | null> {
  const since = lagosDayStart(now);

  const rider = await prisma.rider.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      name: true,
      phone: true,
      vehicle: true,
      isActive: true,
      isAvailable: true,
      user: { select: { email: true, isActive: true } },
      deliveries: {
        orderBy: { assignedAt: "desc" },
        take: 50,
        select: {
          id: true,
          assignedAt: true,
          deliveredAt: true,
          failedAt: true,
          order: { select: { id: true, orderNumber: true, status: true, totalKobo: true } },
        },
      },
    },
  });

  if (!rider) return null;

  const [deliveriesToday, deliveredToday, failedToday, inFlight, held, handed] = await Promise.all([
    prisma.delivery.count({ where: { riderId: id, assignedAt: { gte: since } } }),
    prisma.delivery.count({ where: { riderId: id, deliveredAt: { gte: since } } }),
    prisma.delivery.count({ where: { riderId: id, failedAt: { gte: since } } }),
    prisma.delivery.count({ where: { riderId: id, deliveredAt: null, failedAt: null } }),
    prisma.cashCollection.aggregate({
      where: { riderId: id, status: "pending" },
      _sum: { amountKobo: true },
    }),
    prisma.cashCollection.aggregate({
      where: { riderId: id, status: { in: ["handed_over", "received"] } },
      _sum: { amountKobo: true },
    }),
  ]);

  return {
    id: rider.id,
    userId: rider.userId,
    name: rider.name,
    phone: rider.phone,
    vehicle: rider.vehicle,
    isActive: rider.isActive,
    isAvailable: rider.isAvailable,
    state: riderState({ isActive: rider.isActive, isAvailable: rider.isAvailable, inFlight }),
    email: rider.user.email,
    userIsActive: rider.user.isActive,
    deliveriesToday,
    deliveredToday,
    failedToday,
    inFlight,
    cashInHandKobo: held._sum.amountKobo ?? 0n,
    cashHandedOverKobo: handed._sum.amountKobo ?? 0n,
    deliveries: rider.deliveries.map((delivery) => {
      const end = delivery.deliveredAt ?? delivery.failedAt;
      return {
        id: delivery.id,
        orderId: delivery.order.id,
        orderNumber: delivery.order.orderNumber,
        status: delivery.order.status,
        assignedAt: delivery.assignedAt,
        deliveredAt: delivery.deliveredAt,
        failedAt: delivery.failedAt,
        totalKobo: delivery.order.totalKobo,
        minutes:
          end === null
            ? null
            : Math.max(0, Math.round((end.getTime() - delivery.assignedAt.getTime()) / 60000)),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Rider writes
// ---------------------------------------------------------------------------

/**
 * Add a rider.
 *
 * A rider is a login plus a profile row, created together: a rider with no
 * `users` row cannot sign in to the rider interface, and a `users` row with no
 * `rider` row cannot be assigned anything. Riders are never deleted — deliveries
 * reference them with `onDelete: Restrict`, and a rider who has left is
 * suspended, which keeps their delivery history readable.
 */
export async function createRider(input: {
  readonly name: string;
  readonly phone: string;
  readonly email?: string | null;
  readonly vehicle?: string | null;
  readonly password: string;
  readonly actor: OrderActor;
}): Promise<string> {
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (name === "") throw ApiError.badRequest("A rider needs a name.");
  if (phone === "") throw ApiError.badRequest("A rider needs a phone number.");
  if (input.password.length < 12) {
    throw ApiError.badRequest("A password must be at least 12 characters.");
  }

  const email = input.email?.trim().toLowerCase() || null;

  const clash = await prisma.user.findFirst({
    where: { OR: [{ phone }, ...(email ? [{ email }] : [])] },
    select: { phone: true, email: true },
  });
  if (clash) {
    throw ApiError.conflict(
      clash.phone === phone
        ? "That phone number is already on another account."
        : "Somebody already signs in with that email address.",
    );
  }

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { role: "rider", name, phone, email, passwordHash },
    });

    const rider = await tx.rider.create({
      data: {
        userId: user.id,
        name,
        phone,
        vehicle: input.vehicle?.trim() || null,
        isActive: true,
        // Starts off shift. Going on shift is the rider's own act from their
        // own interface, and a new account that appears to be on shift before
        // its owner has signed in would be assigned work they never accepted.
        isAvailable: false,
      },
    });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "rider.created",
        entityType: "rider",
        entityId: rider.id,
        after: { name, phone, userId: user.id, vehicle: rider.vehicle },
      },
      tx,
    );

    return rider.id;
  });
}

export interface RiderPatch {
  readonly name?: string;
  readonly phone?: string;
  readonly vehicle?: string | null;
  readonly isActive?: boolean;
  readonly isAvailable?: boolean;
}

/**
 * Edit a rider.
 *
 * Suspending revokes their sessions in the same transaction, for the same reason
 * a deactivated kitchen login does: a suspension that leaves a working refresh
 * token is a suspension that lasts until the token expires.
 */
export async function updateRider(input: {
  readonly riderId: string;
  readonly patch: RiderPatch;
  readonly actor: OrderActor;
}): Promise<void> {
  const before = await prisma.rider.findUnique({
    where: { id: input.riderId },
    select: {
      userId: true,
      name: true,
      phone: true,
      vehicle: true,
      isActive: true,
      isAvailable: true,
    },
  });
  if (!before) throw ApiError.notFound("That rider no longer exists.");

  const data: {
    name?: string;
    phone?: string;
    vehicle?: string | null;
    isActive?: boolean;
    isAvailable?: boolean;
  } = {};

  if (input.patch.name !== undefined) {
    const name = input.patch.name.trim();
    if (name === "") throw ApiError.badRequest("A rider needs a name.");
    data.name = name;
  }
  if (input.patch.phone !== undefined) {
    const phone = input.patch.phone.trim();
    if (phone === "") throw ApiError.badRequest("A rider needs a phone number.");
    if (phone !== before.phone) {
      const taken = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
      if (taken) throw ApiError.conflict("That phone number is already on another account.");
      // The `users` row and the `rider` row both carry the phone, and the rider
      // row is what the delivery screens read, so both move together.
      data.phone = phone;
    }
  }
  if (input.patch.vehicle !== undefined) data.vehicle = input.patch.vehicle?.trim() || null;
  if (input.patch.isActive !== undefined) {
    data.isActive = input.patch.isActive;
    if (!input.patch.isActive) data.isAvailable = false;
  }
  if (input.patch.isAvailable !== undefined) {
    if (!before.isActive && input.patch.isAvailable) {
      throw ApiError.conflict("A suspended rider cannot be marked available.");
    }
    data.isAvailable = input.patch.isAvailable;
  }

  if (Object.keys(data).length === 0) return;

  const suspended = data.isActive === false && before.isActive;

  await prisma.$transaction(async (tx) => {
    const after = await tx.rider.update({ where: { id: input.riderId }, data });

    // The two tables that carry the phone number are kept in step here rather
    // than by a trigger, because a trigger is invisible and this is not.
    if (data.phone) {
      await tx.user.update({ where: { id: before.userId }, data: { phone: data.phone } });
    }
    if (data.name) {
      await tx.user.update({ where: { id: before.userId }, data: { name: data.name } });
    }
    if (suspended) {
      await tx.user.update({ where: { id: before.userId }, data: { isActive: false } });
      await tx.session.updateMany({
        where: { userId: before.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else if (data.isActive === true) {
      await tx.user.update({ where: { id: before.userId }, data: { isActive: true } });
    }

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: suspended ? "rider.suspended" : "rider.updated",
        entityType: "rider",
        entityId: input.riderId,
        before: snapshot(before),
        after: snapshot({
          name: after.name,
          phone: after.phone,
          vehicle: after.vehicle,
          isActive: after.isActive,
          isAvailable: after.isAvailable,
        }),
      },
      tx,
    );
  });
}
