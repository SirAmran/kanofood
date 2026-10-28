import { prisma } from "@kanofood/db";

import { ApiError } from "../api/http";
import type { Actor } from "../auth/guard";
import { deleteObject } from "../storage";
import { featuredFallbackRows } from "../public/featured";
import { audit, snapshot } from "./audit";

/**
 * Featured cards. `/admin/featured`.
 *
 * The home rail used to be calculated, so an operator could not change it. This
 * is the write path for the table that replaced the calculation: create, edit,
 * reorder, hide, delete, and the one button that turns the built-in starting set
 * into real rows.
 *
 * **The href is an internal path.** A featured card is shown on the storefront
 * and a card that points off-site would be a redirect somebody paid no attention
 * to. The API refuses anything that is not rooted at `/`, including `//host`,
 * which a browser reads as a protocol-relative absolute URL. Checked here as
 * well as in the route so a second caller cannot skip it.
 *
 * An image is attached after the row exists, through the same upload route as a
 * kitchen and a dish. Replacing one deletes the previous object only after the
 * row points at the new one, so a failed update cannot leave a broken picture.
 */

export interface AdminFeaturedCard {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly imageUrl: string | null;
  readonly href: string;
  readonly badge: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

export interface FeaturedCardPatch {
  readonly title?: string;
  readonly subtitle?: string | null;
  readonly imageUrl?: string | null;
  readonly href?: string | null;
  readonly badge?: string | null;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

/** The number of rows the admin screen is willing to load at once. */
const ADMIN_LIMIT = 100;

function assertHref(href: string): string {
  const value = href.trim();
  if (!value.startsWith("/") || value.startsWith("//")) {
    throw ApiError.badRequest("The link must be a path on this site, starting with a single /.");
  }
  return value;
}

/** An image is either one of ours (`/images/...`) or an absolute http(s) URL. */
function assertImageUrl(url: string): string {
  const value = url.trim();
  if (!value.startsWith("/") && !/^https?:\/\//i.test(value)) {
    throw ApiError.badRequest("The image must be a full https URL or a path that starts with /.");
  }
  return value;
}

function normalise(patch: FeaturedCardPatch) {
  const data: Record<string, unknown> = {};

  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.subtitle !== undefined) {
    const subtitle = patch.subtitle?.trim() ?? "";
    data.subtitle = subtitle === "" ? null : subtitle;
  }
  if (patch.badge !== undefined) {
    const badge = patch.badge?.trim() ?? "";
    data.badge = badge === "" ? null : badge;
  }
  if (patch.imageUrl !== undefined) {
    const imageUrl = patch.imageUrl?.trim() ?? "";
    data.imageUrl = imageUrl === "" ? null : assertImageUrl(imageUrl);
  }
  if (patch.href !== undefined) {
    // A card always has somewhere to go. Clearing the field falls back to the
    // kitchen index rather than writing a link that resolves to the same page.
    const href = patch.href?.trim() ?? "";
    data.href = href === "" ? "/kitchens" : assertHref(href);
  }
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;

  return data;
}

export async function listFeaturedCards(): Promise<{
  readonly cards: readonly AdminFeaturedCard[];
  /** True when the home screen is showing the built-in set, not rows. */
  readonly usingFallback: boolean;
}> {
  const rows = await prisma.featuredCard.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: ADMIN_LIMIT,
    select: {
      id: true,
      title: true,
      subtitle: true,
      imageUrl: true,
      href: true,
      badge: true,
      sortOrder: true,
      isActive: true,
    },
  });

  return { cards: rows, usingFallback: rows.length === 0 };
}

export async function createFeaturedCard(input: {
  readonly card: FeaturedCardPatch;
  readonly actor: Actor;
}): Promise<string> {
  if (!input.card.title || input.card.title.trim() === "") {
    throw ApiError.badRequest("A featured card needs a title.");
  }

  const data = normalise({
    ...input.card,
    // A new card goes to the end unless the operator says otherwise. The rail
    // reads in this order, so "new" means last, not first.
    sortOrder: input.card.sortOrder ?? 100,
    isActive: input.card.isActive ?? true,
  }) as {
    title: string;
    subtitle?: string | null;
    imageUrl?: string | null;
    href?: string;
    badge?: string | null;
    sortOrder: number;
    isActive: boolean;
  };

  return prisma.$transaction(async (tx) => {
    const card = await tx.featuredCard.create({
      data: {
        title: data.title,
        subtitle: data.subtitle ?? null,
        imageUrl: data.imageUrl ?? null,
        href: data.href ?? "/kitchens",
        badge: data.badge ?? null,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "featured_card.created",
        entityType: "featured_card",
        entityId: card.id,
        after: snapshot({ title: card.title, href: card.href, sortOrder: card.sortOrder }),
      },
      tx,
    );

    return card.id;
  });
}

export async function updateFeaturedCard(input: {
  readonly id: string;
  readonly patch: FeaturedCardPatch;
  readonly actor: Actor;
}): Promise<void> {
  const existing = await prisma.featuredCard.findUnique({
    where: { id: input.id },
    select: { id: true, title: true, subtitle: true, imageUrl: true, href: true, badge: true, sortOrder: true, isActive: true },
  });
  if (!existing) throw ApiError.notFound("That featured card no longer exists.");

  const data = normalise(input.patch);
  if (Object.keys(data).length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.featuredCard.update({ where: { id: input.id }, data });
    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "featured_card.updated",
        entityType: "featured_card",
        entityId: input.id,
        before: snapshot(existing),
        after: snapshot(data),
      },
      tx,
    );
  });

  // A replaced storage object goes after the row is safe. A local starter image
  // has no object behind it, and `deleteObject` answers that with a no-op.
  const next = typeof data.imageUrl === "string" ? data.imageUrl : existing.imageUrl;
  if (existing.imageUrl && existing.imageUrl !== next) {
    await deleteObject(existing.imageUrl, "replaced featured card image");
  }
}

export async function deleteFeaturedCard(input: {
  readonly id: string;
  readonly actor: Actor;
}): Promise<void> {
  const existing = await prisma.featuredCard.findUnique({
    where: { id: input.id },
    select: { id: true, title: true, imageUrl: true },
  });
  if (!existing) throw ApiError.notFound("That featured card no longer exists.");

  await prisma.$transaction(async (tx) => {
    await tx.featuredCard.delete({ where: { id: input.id } });
    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "featured_card.deleted",
        entityType: "featured_card",
        entityId: input.id,
        before: snapshot(existing),
      },
      tx,
    );
  });

  if (existing.imageUrl) await deleteObject(existing.imageUrl, "deleted featured card image");
}

/** Attach an uploaded image to a card. Same order as a menu item: row, then object. */
export async function setFeaturedCardImage(input: {
  readonly cardId: string;
  readonly imageUrl: string;
  readonly actor: Actor;
}): Promise<void> {
  const existing = await prisma.featuredCard.findUnique({
    where: { id: input.cardId },
    select: { imageUrl: true },
  });
  if (!existing) throw ApiError.notFound("That featured card no longer exists.");

  await prisma.$transaction(async (tx) => {
    await tx.featuredCard.update({ where: { id: input.cardId }, data: { imageUrl: input.imageUrl } });
    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "featured_card.image_changed",
        entityType: "featured_card",
        entityId: input.cardId,
        before: { imageUrl: existing.imageUrl },
        after: { imageUrl: input.imageUrl },
      },
      tx,
    );
  });

  if (existing.imageUrl && existing.imageUrl !== input.imageUrl) {
    await deleteObject(existing.imageUrl, "replaced featured card image");
  }
}

/**
 * Copy the built-in starting set into real rows.
 *
 * Idempotent in the only way that matters: if any row exists it does nothing.
 * Adding a second set on top of one an operator has already edited is the kind
 * of "helpful" button that duplicates a storefront overnight.
 */
export async function seedFeaturedDefaults(input: { readonly actor: Actor }): Promise<number> {
  const existing = await prisma.featuredCard.count();
  if (existing > 0) return 0;

  const rows = featuredFallbackRows();

  await prisma.$transaction(async (tx) => {
    await tx.featuredCard.createMany({ data: rows });
    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "featured_card.defaults_loaded",
        entityType: "featured_card",
        entityId: "starter-set",
        after: { count: rows.length },
      },
      tx,
    );
  });

  return rows.length;
}
