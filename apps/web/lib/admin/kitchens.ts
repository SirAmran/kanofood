import { LOST_STATUSES, computeCommission, parseRateToBasisPoints } from "@kanofood/core";
import type { Kobo } from "@kanofood/core";
import { Prisma, prisma } from "@kanofood/db";

import { ApiError } from "../api/http";
import { hashPassword } from "../auth/password";
import { deleteObject } from "../storage";
import { audit, snapshot } from "./audit";
import { lagosDayStart } from "./status";
import type { OrderActor } from "./orders";

/**
 * Kitchens. Screen 7.5 in docs/UX_SPEC.md.
 *
 * The list carries today's trading; the detail carries the profile, the menu,
 * the staff logins and the commercial arrangement.
 *
 * "Sales" here means the value of what the kitchen cooked today, which is the
 * sum of the order *subtotals* of orders placed today that have not been
 * cancelled or failed. Two deliberate choices are in that sentence:
 *
 *   - Subtotals, not totals. The delivery fee is platform revenue and the
 *     kitchen never sees it. Counting totals would overstate every kitchen's
 *     trading by the delivery fee and make the number disagree with the
 *     settlement the kitchen is paid against.
 *   - Live and delivered orders only. An order that was cancelled or failed was
 *     still cooked in some cases, but it is not a sale, and a sales figure that
 *     counts cancellations is a figure nobody can reconcile.
 */

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface KitchenListRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly isOpen: boolean;
  readonly isActive: boolean;
  readonly phone: string | null;
  readonly prepTimeMinutes: number | null;
  readonly commissionRate: string | null;
  readonly ordersToday: number;
  readonly salesTodayKobo: Kobo;
  readonly menuItemCount: number;
}

export async function listKitchens(now: Date = new Date()): Promise<readonly KitchenListRow[]> {
  const since = lagosDayStart(now);

  /**
   * Three queries for the whole table, not three per kitchen.
   *
   * The naive version of this screen loops the kitchens and asks for each one's
   * trading, which is 3N round trips. On a hosted Postgres that is slow; on this
   * machine's disk it is slow enough to notice. Two group-bys and a count do the
   * same work in three round trips regardless of how many kitchens exist.
   *
   * The count is of every order placed today, including ones later cancelled,
   * because it answers "how busy was the kitchen". The sales figure excludes the
   * four dead ends, because it answers "what did the kitchen earn".
   */
  const [kitchens, placed, earned, menuCounts] = await Promise.all([
    prisma.kitchen.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        isOpen: true,
        isActive: true,
        phone: true,
        prepTimeMinutes: true,
        commissionRate: true,
      },
    }),
    prisma.order.groupBy({
      by: ["kitchenId"],
      where: { placedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["kitchenId"],
      where: {
        placedAt: { gte: since },
        status: { notIn: [...LOST_STATUSES] },
      },
      _sum: { subtotalKobo: true },
    }),
    prisma.menuItem.groupBy({ by: ["kitchenId"], _count: { _all: true } }),
  ]);

  const placedBy = new Map(placed.map((row) => [row.kitchenId, row._count._all]));
  const earnedBy = new Map(earned.map((row) => [row.kitchenId, row._sum.subtotalKobo ?? 0n]));
  const menuBy = new Map(menuCounts.map((row) => [row.kitchenId, row._count._all]));

  return kitchens.map((kitchen) => ({
    id: kitchen.id,
    name: kitchen.name,
    slug: kitchen.slug,
    isOpen: kitchen.isOpen,
    isActive: kitchen.isActive,
    phone: kitchen.phone,
    prepTimeMinutes: kitchen.prepTimeMinutes,
    // A rate, not money, so it stays a string. `parseRateToBasisPoints` is what
    // turns it into basis points when a settlement is computed.
    commissionRate: kitchen.commissionRate === null ? null : kitchen.commissionRate.toFixed(4),
    ordersToday: placedBy.get(kitchen.id) ?? 0,
    salesTodayKobo: earnedBy.get(kitchen.id) ?? 0n,
    menuItemCount: menuBy.get(kitchen.id) ?? 0,
  }));
}

export interface KitchenMenuItem {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly priceKobo: Kobo;
  readonly imageUrl: string | null;
  readonly isAvailable: boolean;
  readonly sortOrder: number;
}

export interface KitchenMenuCategory {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly items: readonly KitchenMenuItem[];
}

export interface KitchenStaffRow {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly role: "owner" | "staff";
  readonly isActive: boolean;
}

export interface KitchenDetail {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly phone: string | null;
  readonly logoUrl: string | null;
  readonly coverUrl: string | null;
  readonly addressText: string | null;
  readonly landmark: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly isOpen: boolean;
  readonly isActive: boolean;
  readonly prepTimeMinutes: number | null;
  readonly commissionRate: string | null;
  readonly commissionKoboOn100k: Kobo | null;
  readonly categories: readonly KitchenMenuCategory[];
  readonly staff: readonly KitchenStaffRow[];
  readonly ordersToday: number;
  readonly salesTodayKobo: Kobo;
  readonly liveOrders: number;
}

export async function loadKitchen(id: string, now: Date = new Date()): Promise<KitchenDetail | null> {
  const since = lagosDayStart(now);

  const kitchen = await prisma.kitchen.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      phone: true,
      logoUrl: true,
      coverUrl: true,
      addressText: true,
      landmark: true,
      lat: true,
      lng: true,
      isOpen: true,
      isActive: true,
      prepTimeMinutes: true,
      commissionRate: true,
      categories: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          sortOrder: true,
          isActive: true,
          items: {
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            select: {
              id: true,
              name: true,
              description: true,
              priceKobo: true,
              imageUrl: true,
              isAvailable: true,
              sortOrder: true,
            },
          },
        },
      },
      staff: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          user: { select: { id: true, name: true, email: true, phone: true, isActive: true } },
        },
      },
    },
  });

  if (!kitchen) return null;

  const [ordersToday, subtotals, liveOrders] = await Promise.all([
    prisma.order.count({ where: { kitchenId: id, placedAt: { gte: since } } }),
    prisma.order.aggregate({
      where: {
        kitchenId: id,
        placedAt: { gte: since },
        status: { notIn: [...LOST_STATUSES] },
      },
      _sum: { subtotalKobo: true },
    }),
    prisma.order.count({
      where: {
        kitchenId: id,
        status: { notIn: ["DELIVERED", ...LOST_STATUSES] },
      },
    }),
  ]);

  const rate = kitchen.commissionRate === null ? null : kitchen.commissionRate.toFixed(4);

  return {
    id: kitchen.id,
    name: kitchen.name,
    slug: kitchen.slug,
    description: kitchen.description,
    phone: kitchen.phone,
    logoUrl: kitchen.logoUrl,
    coverUrl: kitchen.coverUrl,
    addressText: kitchen.addressText,
    landmark: kitchen.landmark,
    lat: kitchen.lat,
    lng: kitchen.lng,
    isOpen: kitchen.isOpen,
    isActive: kitchen.isActive,
    prepTimeMinutes: kitchen.prepTimeMinutes,
    commissionRate: rate,
    // Worked out from the real function rather than a second calculation, so what
    // the screen shows and what a settlement charges can never disagree.
    commissionKoboOn100k: rate === null ? null : computeCommission(100_000n, parseRateToBasisPoints(rate)),
    categories: kitchen.categories.map((category) => ({
      id: category.id,
      name: category.name,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      items: category.items,
    })),
    staff: kitchen.staff.map((member) => ({
      id: member.id,
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      phone: member.user.phone,
      role: member.role,
      isActive: member.user.isActive,
    })),
    ordersToday,
    salesTodayKobo: subtotals._sum.subtotalKobo ?? 0n,
    liveOrders,
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export interface KitchenProfileInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly phone?: string | null;
  readonly addressText?: string | null;
  readonly landmark?: string | null;
  readonly lat?: number | null;
  readonly lng?: number | null;
  readonly prepTimeMinutes?: number | null;
}

/**
 * Edit a kitchen's profile.
 *
 * Only the fields that were given are written, so a form that edits one field
 * cannot blank the others by omission. The slug is not editable here: it is what
 * `DELIVERY_DEFAULT_ZONE`-style configuration and any shared link point at, and
 * changing it silently breaks both.
 */
export async function updateKitchenProfile(input: {
  readonly kitchenId: string;
  readonly patch: KitchenProfileInput;
  readonly actor: OrderActor;
  /** Set by the kitchen interface, so its own edits are not recorded as admin. */
  readonly actorRole?: "admin" | "kitchen_staff";
}): Promise<void> {
  const before = await prisma.kitchen.findUnique({
    where: { id: input.kitchenId },
    select: {
      name: true,
      description: true,
      phone: true,
      addressText: true,
      landmark: true,
      lat: true,
      lng: true,
      prepTimeMinutes: true,
    },
  });

  if (!before) throw ApiError.notFound("That kitchen no longer exists.");

  if (input.patch.name !== undefined && input.patch.name.trim() === "") {
    throw ApiError.badRequest("A kitchen needs a name.");
  }

  const data: Prisma.KitchenUpdateInput = {};
  if (input.patch.name !== undefined) data.name = input.patch.name.trim();
  if (input.patch.description !== undefined) data.description = input.patch.description;
  if (input.patch.phone !== undefined) data.phone = input.patch.phone;
  if (input.patch.addressText !== undefined) data.addressText = input.patch.addressText;
  if (input.patch.landmark !== undefined) data.landmark = input.patch.landmark;
  if (input.patch.lat !== undefined) data.lat = input.patch.lat;
  if (input.patch.lng !== undefined) data.lng = input.patch.lng;
  if (input.patch.prepTimeMinutes !== undefined) data.prepTimeMinutes = input.patch.prepTimeMinutes;

  if (Object.keys(data).length === 0) return;

  await prisma.$transaction(async (tx) => {
    const after = await tx.kitchen.update({ where: { id: input.kitchenId }, data });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: input.actorRole ?? "admin",
        action: "kitchen.updated",
        entityType: "kitchen",
        entityId: input.kitchenId,
        before: snapshot(before),
        after: snapshot({
          name: after.name,
          description: after.description,
          phone: after.phone,
          addressText: after.addressText,
          landmark: after.landmark,
          lat: after.lat,
          lng: after.lng,
          prepTimeMinutes: after.prepTimeMinutes,
        }),
      },
      tx,
    );
  });
}

/**
 * Open or close a kitchen for trading.
 *
 * Separate from the profile edit because it is the switch that decides whether
 * customers can order at all, it is flipped far more often than anything on the
 * profile form, and it wants its own audit action so "who closed the kitchen at
 * 8pm" is one query rather than a diff of two snapshots.
 */
export async function setKitchenOpen(input: {
  readonly kitchenId: string;
  readonly isOpen: boolean;
  readonly actor: OrderActor;
  readonly actorRole?: "admin" | "kitchen_staff";
}): Promise<void> {
  const kitchen = await prisma.kitchen.findUnique({
    where: { id: input.kitchenId },
    select: { isOpen: true, isActive: true, name: true },
  });

  if (!kitchen) throw ApiError.notFound("That kitchen no longer exists.");
  if (input.isOpen && !kitchen.isActive) {
    throw ApiError.conflict(`${kitchen.name} is suspended. Reactivate it before opening.`);
  }
  if (kitchen.isOpen === input.isOpen) return;

  await prisma.$transaction(async (tx) => {
    await tx.kitchen.update({ where: { id: input.kitchenId }, data: { isOpen: input.isOpen } });
    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: input.actorRole ?? "admin",
        action: input.isOpen ? "kitchen.opened" : "kitchen.closed",
        entityType: "kitchen",
        entityId: input.kitchenId,
        before: { isOpen: kitchen.isOpen },
        after: { isOpen: input.isOpen },
      },
      tx,
    );
  });
}

/** Suspend or reinstate a kitchen. Active is the platform's own switch. */
export async function setKitchenActive(input: {
  readonly kitchenId: string;
  readonly isActive: boolean;
  readonly actor: OrderActor;
}): Promise<void> {
  const kitchen = await prisma.kitchen.findUnique({
    where: { id: input.kitchenId },
    select: { isOpen: true, isActive: true, name: true },
  });

  if (!kitchen) throw ApiError.notFound("That kitchen no longer exists.");

  await prisma.$transaction(async (tx) => {
    // Suspending closes it in the same breath. A suspended kitchen left open is
    // a kitchen customers can still order from, which defeats the suspension.
    await tx.kitchen.update({
      where: { id: input.kitchenId },
      data: input.isActive ? { isActive: true } : { isActive: false, isOpen: false },
    });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: input.isActive ? "kitchen.reinstated" : "kitchen.suspended",
        entityType: "kitchen",
        entityId: input.kitchenId,
        before: { isActive: kitchen.isActive, isOpen: kitchen.isOpen },
        after: { isActive: input.isActive, isOpen: input.isActive ? kitchen.isOpen : false },
      },
      tx,
    );
  });
}

/**
 * Set the commission rate.
 *
 * The rate arrives as a string so it never passes through a float. It is
 * validated by `parseRateToBasisPoints` before it is stored, which is the same
 * function a settlement uses to read it back, so a rate that cannot be parsed is
 * refused here rather than throwing on the settlements screen a month later.
 *
 * Changing a rate affects settlements computed from here on. Settlements already
 * written are rows with their own figures and are never recalculated, which is
 * what "a settled order's financial snapshot never changes" means in practice.
 */
export async function setCommissionRate(input: {
  readonly kitchenId: string;
  /** A decimal fraction as a string: "0.1000" is 10%. Null clears it to zero. */
  readonly rate: string | null;
  readonly actor: OrderActor;
}): Promise<void> {
  const kitchen = await prisma.kitchen.findUnique({
    where: { id: input.kitchenId },
    select: { commissionRate: true },
  });

  if (!kitchen) throw ApiError.notFound("That kitchen no longer exists.");

  let parsed: Prisma.Decimal | null = null;
  if (input.rate !== null && input.rate.trim() !== "") {
    try {
      parseRateToBasisPoints(input.rate.trim());
    } catch (error) {
      throw ApiError.badRequest(
        error instanceof Error ? error.message : "That is not a commission rate.",
      );
    }
    parsed = new Prisma.Decimal(input.rate.trim());
  }

  await prisma.$transaction(async (tx) => {
    await tx.kitchen.update({ where: { id: input.kitchenId }, data: { commissionRate: parsed } });
    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "kitchen.commission_changed",
        entityType: "kitchen",
        entityId: input.kitchenId,
        before: { commissionRate: kitchen.commissionRate?.toFixed(4) ?? null },
        after: { commissionRate: parsed?.toFixed(4) ?? null },
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------------

/**
 * A slug from a name.
 *
 * A kitchen is addressed by slug in configuration and in shared links, so it is
 * generated once from the name and never edited afterwards. Uniqueness is
 * settled against the table rather than assumed, because two kitchens called
 * "Mama's Kitchen" is not a hypothetical.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function createKitchen(input: {
  readonly name: string;
  readonly phone?: string | null;
  readonly addressText?: string | null;
  readonly landmark?: string | null;
  readonly description?: string | null;
  readonly prepTimeMinutes?: number | null;
  /**
   * The pin, and it is not decoration. Every delivery fee the platform quotes is
   * measured from the kitchen that cooks the food, so a kitchen created without
   * a location can only ever be priced at its zone's base fee. That is a valid
   * fallback for a kitchen whose position nobody has surveyed yet, and it is not
   * a valid end state.
   */
  readonly lat?: number | null;
  readonly lng?: number | null;
  readonly actor: OrderActor;
}): Promise<string> {
  const name = input.name.trim();
  if (name === "") throw ApiError.badRequest("A kitchen needs a name.");

  const base = slugify(name);
  if (base === "") {
    throw ApiError.badRequest("That name has no letters or digits in it, so it cannot be addressed.");
  }

  // The slug column is unique, so a clash is settled here rather than left to a
  // constraint violation nobody can read.
  const taken = await prisma.kitchen.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const used = new Set(taken.map((row) => row.slug));
  let slug = base;
  let suffix = 2;
  while (used.has(slug)) {
    slug = `${base}-${String(suffix)}`;
    suffix += 1;
  }

  return prisma.$transaction(async (tx) => {
    const kitchen = await tx.kitchen.create({
      data: {
        name,
        slug,
        phone: input.phone?.trim() || null,
        addressText: input.addressText?.trim() || null,
        landmark: input.landmark?.trim() || null,
        description: input.description?.trim() || null,
        prepTimeMinutes: input.prepTimeMinutes ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        // New kitchens start closed. Opening is a deliberate act by whoever set
        // it up, once the menu is in and the phone number works.
        isOpen: false,
        isActive: true,
      },
    });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "kitchen.created",
        entityType: "kitchen",
        entityId: kitchen.id,
        after: snapshot({ name, slug, phone: kitchen.phone }),
      },
      tx,
    );

    return kitchen.id;
  });
}

/** Attach an uploaded image to a kitchen, and remove the one it replaces. */
export async function setKitchenImage(input: {
  readonly kitchenId: string;
  readonly kind: "logo" | "cover";
  readonly url: string;
  readonly actor: OrderActor;
  readonly actorRole?: "admin" | "kitchen_staff";
}): Promise<void> {
  const kitchen = await prisma.kitchen.findUnique({
    where: { id: input.kitchenId },
    select: { logoUrl: true, coverUrl: true },
  });
  if (!kitchen) throw ApiError.notFound("That kitchen no longer exists.");

  const previous = input.kind === "logo" ? kitchen.logoUrl : kitchen.coverUrl;

  await prisma.$transaction(async (tx) => {
    await tx.kitchen.update({
      where: { id: input.kitchenId },
      data: input.kind === "logo" ? { logoUrl: input.url } : { coverUrl: input.url },
    });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: input.actorRole ?? "admin",
        action: input.kind === "logo" ? "kitchen.logo_changed" : "kitchen.cover_changed",
        entityType: "kitchen",
        entityId: input.kitchenId,
        before: { url: previous },
        after: { url: input.url },
      },
      tx,
    );
  });

  if (previous && previous !== input.url) {
    await deleteObject(previous, `replaced kitchen ${input.kind}`);
  }
}

// ---------------------------------------------------------------------------
// Staff logins
// ---------------------------------------------------------------------------

/**
 * Give a kitchen a login.
 *
 * The `users` row and the `kitchen_users` link are created together. The role on
 * `users` is `kitchen_staff` for both owner and staff: `UserRole` and
 * `KitchenStaffRole` are different axes, and the platform-wide one is what the
 * access token carries. Ownership is per kitchen and lives on the link.
 */
export async function createKitchenStaff(input: {
  readonly kitchenId: string;
  readonly name: string;
  readonly email: string;
  readonly phone?: string | null;
  readonly password: string;
  readonly role: "owner" | "staff";
  readonly actor: OrderActor;
}): Promise<string> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name === "") throw ApiError.badRequest("A staff member needs a name.");
  if (email === "") throw ApiError.badRequest("A staff login needs an email address.");
  if (input.password.length < 12) {
    throw ApiError.badRequest("A password must be at least 12 characters.");
  }

  const kitchen = await prisma.kitchen.findUnique({
    where: { id: input.kitchenId },
    select: { id: true },
  });
  if (!kitchen) throw ApiError.notFound("That kitchen no longer exists.");

  const phone = input.phone?.trim() || null;

  // Checked before the hash is computed so a clash costs one cheap query rather
  // than a deliberate scrypt run. The unique constraint is still the backstop.
  const clash = await prisma.user.findFirst({
    where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
    select: { email: true, phone: true },
  });
  if (clash) {
    throw ApiError.conflict(
      clash.email === email
        ? "Somebody already signs in with that email address."
        : "That phone number is already on another account.",
    );
  }

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { role: "kitchen_staff", name, email, phone, passwordHash },
    });

    const link = await tx.kitchenStaff.create({
      data: { kitchenId: input.kitchenId, userId: user.id, role: input.role },
    });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "kitchen_staff.created",
        entityType: "kitchen_staff",
        entityId: link.id,
        after: { kitchenId: input.kitchenId, userId: user.id, email, role: input.role },
      },
      tx,
    );

    return link.id;
  });
}

/** Turn a kitchen login on or off, without deleting the account or its history. */
export async function setKitchenStaffActive(input: {
  readonly staffLinkId: string;
  readonly isActive: boolean;
  readonly actor: OrderActor;
}): Promise<void> {
  const link = await prisma.kitchenStaff.findUnique({
    where: { id: input.staffLinkId },
    select: {
      id: true,
      kitchenId: true,
      userId: true,
      user: { select: { isActive: true, email: true } },
    },
  });
  if (!link) throw ApiError.notFound("That staff login no longer exists.");

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: link.userId }, data: { isActive: input.isActive } });

    // Every session for that user ends with the account. Deactivating a login
    // that stays usable until its refresh token expires is not a revocation.
    if (!input.isActive) {
      await tx.session.updateMany({
        where: { userId: link.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: input.isActive ? "kitchen_staff.enabled" : "kitchen_staff.disabled",
        entityType: "kitchen_staff",
        entityId: link.id,
        before: { isActive: link.user.isActive },
        after: { isActive: input.isActive, email: link.user.email },
      },
      tx,
    );
  });
}
