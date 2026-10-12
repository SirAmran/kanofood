import { parseNairaToKobo } from "@kanofood/core";
import type { Kobo } from "@kanofood/core";
import { prisma } from "@kanofood/db";

import { ApiError } from "../api/http";
import { audit, snapshot } from "./audit";
import { deleteObject } from "../storage";
import type { OrderActor } from "./orders";

/**
 * The menu. Part of screen 7.5 in docs/UX_SPEC.md.
 *
 * Every write here is a menu edit, and menu edits are the reason the order
 * snapshots exist. Changing a price, renaming an item or removing one from the
 * menu must never alter an order already placed, and none of it does: an order
 * carries `name_snapshot` and `unit_price_snapshot_kobo`, and `order_items`
 * references a menu item with `onDelete: SetNull` so deleting one leaves the
 * history intact.
 *
 * Categories are never deleted. `menu_categories` cascades to `menu_items`, so a
 * delete would take the items with it, and an item that is off the menu is a
 * normal state rather than a hole in the data. `isActive` is the switch.
 */

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function createCategory(input: {
  readonly kitchenId: string;
  readonly name: string;
  readonly sortOrder?: number;
  readonly actor: OrderActor;
}): Promise<string> {
  const name = input.name.trim();
  if (name === "") throw ApiError.badRequest("A category needs a name.");

  const kitchen = await prisma.kitchen.findUnique({
    where: { id: input.kitchenId },
    select: { id: true },
  });
  if (!kitchen) throw ApiError.notFound("That kitchen no longer exists.");

  return prisma.$transaction(async (tx) => {
    const category = await tx.menuCategory.create({
      data: { kitchenId: input.kitchenId, name, sortOrder: input.sortOrder ?? 0 },
    });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "menu_category.created",
        entityType: "menu_category",
        entityId: category.id,
        after: { kitchenId: input.kitchenId, name, sortOrder: category.sortOrder },
      },
      tx,
    );

    return category.id;
  });
}

export async function updateCategory(input: {
  readonly categoryId: string;
  readonly patch: { readonly name?: string; readonly sortOrder?: number; readonly isActive?: boolean };
  readonly actor: OrderActor;
}): Promise<void> {
  const before = await prisma.menuCategory.findUnique({
    where: { id: input.categoryId },
    select: { name: true, sortOrder: true, isActive: true },
  });
  if (!before) throw ApiError.notFound("That category no longer exists.");

  const data: { name?: string; sortOrder?: number; isActive?: boolean } = {};
  if (input.patch.name !== undefined) {
    const name = input.patch.name.trim();
    if (name === "") throw ApiError.badRequest("A category needs a name.");
    data.name = name;
  }
  if (input.patch.sortOrder !== undefined) data.sortOrder = input.patch.sortOrder;
  if (input.patch.isActive !== undefined) data.isActive = input.patch.isActive;
  if (Object.keys(data).length === 0) return;

  await prisma.$transaction(async (tx) => {
    const after = await tx.menuCategory.update({ where: { id: input.categoryId }, data });
    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "menu_category.updated",
        entityType: "menu_category",
        entityId: input.categoryId,
        before: snapshot(before),
        after: snapshot({ name: after.name, sortOrder: after.sortOrder, isActive: after.isActive }),
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export interface MenuItemInput {
  readonly categoryId: string;
  readonly name: string;
  readonly description?: string | null;
  /** Naira as typed, parsed to kobo with integer arithmetic. Never a float. */
  readonly priceNaira: string;
  readonly sortOrder?: number;
  readonly isAvailable?: boolean;
}

export async function createMenuItem(input: {
  readonly kitchenId: string;
  readonly item: MenuItemInput;
  readonly actor: OrderActor;
}): Promise<string> {
  const name = input.item.name.trim();
  if (name === "") throw ApiError.badRequest("An item needs a name.");

  let priceKobo: Kobo;
  try {
    priceKobo = parseNairaToKobo(input.item.priceNaira);
  } catch (error) {
    throw ApiError.badRequest(error instanceof Error ? error.message : "That price is not readable.");
  }

  // The category must belong to this kitchen. Without this check a request could
  // attach an item to another kitchen's category, and the item would then be
  // visible on a menu it is not on.
  const category = await prisma.menuCategory.findUnique({
    where: { id: input.item.categoryId },
    select: { id: true, kitchenId: true },
  });
  if (!category) throw ApiError.notFound("That category no longer exists.");
  if (category.kitchenId !== input.kitchenId) {
    throw ApiError.badRequest("That category belongs to a different kitchen.");
  }

  return prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.create({
      data: {
        kitchenId: input.kitchenId,
        categoryId: input.item.categoryId,
        name,
        description: input.item.description?.trim() || null,
        priceKobo,
        sortOrder: input.item.sortOrder ?? 0,
        isAvailable: input.item.isAvailable ?? true,
      },
    });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "menu_item.created",
        entityType: "menu_item",
        entityId: item.id,
        after: snapshot({
          kitchenId: input.kitchenId,
          categoryId: input.item.categoryId,
          name,
          priceKobo,
        }),
      },
      tx,
    );

    return item.id;
  });
}

export interface MenuItemPatch {
  readonly categoryId?: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly priceNaira?: string;
  readonly sortOrder?: number;
  readonly isAvailable?: boolean;
}

export async function updateMenuItem(input: {
  readonly itemId: string;
  readonly patch: MenuItemPatch;
  readonly actor: OrderActor;
}): Promise<void> {
  const before = await prisma.menuItem.findUnique({
    where: { id: input.itemId },
    select: {
      kitchenId: true,
      categoryId: true,
      name: true,
      description: true,
      priceKobo: true,
      sortOrder: true,
      isAvailable: true,
    },
  });
  if (!before) throw ApiError.notFound("That item no longer exists.");

  const data: {
    categoryId?: string;
    name?: string;
    description?: string | null;
    priceKobo?: Kobo;
    sortOrder?: number;
    isAvailable?: boolean;
  } = {};

  if (input.patch.categoryId !== undefined) {
    const category = await prisma.menuCategory.findUnique({
      where: { id: input.patch.categoryId },
      select: { kitchenId: true },
    });
    if (!category) throw ApiError.notFound("That category no longer exists.");
    if (category.kitchenId !== before.kitchenId) {
      throw ApiError.badRequest("That category belongs to a different kitchen.");
    }
    data.categoryId = input.patch.categoryId;
  }

  if (input.patch.name !== undefined) {
    const name = input.patch.name.trim();
    if (name === "") throw ApiError.badRequest("An item needs a name.");
    data.name = name;
  }
  if (input.patch.description !== undefined) data.description = input.patch.description?.trim() || null;
  if (input.patch.priceNaira !== undefined) {
    try {
      data.priceKobo = parseNairaToKobo(input.patch.priceNaira);
    } catch (error) {
      throw ApiError.badRequest(error instanceof Error ? error.message : "That price is not readable.");
    }
  }
  if (input.patch.sortOrder !== undefined) data.sortOrder = input.patch.sortOrder;
  if (input.patch.isAvailable !== undefined) data.isAvailable = input.patch.isAvailable;

  if (Object.keys(data).length === 0) return;

  await prisma.$transaction(async (tx) => {
    const after = await tx.menuItem.update({ where: { id: input.itemId }, data });

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action:
          data.priceKobo !== undefined && before.priceKobo !== data.priceKobo
            ? "menu_item.price_changed"
            : "menu_item.updated",
        entityType: "menu_item",
        entityId: input.itemId,
        before: snapshot(before),
        after: snapshot({
          categoryId: after.categoryId,
          name: after.name,
          description: after.description,
          priceKobo: after.priceKobo,
          sortOrder: after.sortOrder,
          isAvailable: after.isAvailable,
        }),
      },
      tx,
    );
  });
}

/**
 * Mark an item available or not.
 *
 * Its own function, and its own audit action, because this is the one menu edit
 * made mid-service: a kitchen runs out of something and marks it unavailable for
 * two hours. It should not read as an item being renamed or repriced.
 */
export async function setMenuItemAvailable(input: {
  readonly itemId: string;
  readonly isAvailable: boolean;
  readonly actor: OrderActor;
}): Promise<void> {
  const item = await prisma.menuItem.findUnique({
    where: { id: input.itemId },
    select: { isAvailable: true, name: true },
  });
  if (!item) throw ApiError.notFound("That item no longer exists.");
  if (item.isAvailable === input.isAvailable) return;

  await prisma.$transaction(async (tx) => {
    await tx.menuItem.update({ where: { id: input.itemId }, data: { isAvailable: input.isAvailable } });
    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: input.isAvailable ? "menu_item.available" : "menu_item.unavailable",
        entityType: "menu_item",
        entityId: input.itemId,
        before: { isAvailable: item.isAvailable },
        after: { isAvailable: input.isAvailable },
      },
      tx,
    );
  });
}

/**
 * Remove an item from the menu.
 *
 * Safe because `order_items.menu_item_id` is `onDelete: SetNull` and the order
 * keeps its own name and price snapshots. The image object is deleted from
 * storage after the row, and a failure to delete it is logged rather than
 * thrown: the row is already gone, and a 500 would tell the operator the delete
 * failed when it did not.
 */
export async function deleteMenuItem(input: {
  readonly itemId: string;
  readonly actor: OrderActor;
}): Promise<void> {
  const item = await prisma.menuItem.findUnique({
    where: { id: input.itemId },
    select: { id: true, name: true, imageUrl: true, kitchenId: true, categoryId: true },
  });
  if (!item) throw ApiError.notFound("That item no longer exists.");

  await prisma.$transaction(async (tx) => {
    await tx.menuItem.delete({ where: { id: input.itemId } });
    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "menu_item.deleted",
        entityType: "menu_item",
        entityId: input.itemId,
        before: snapshot({
          name: item.name,
          kitchenId: item.kitchenId,
          categoryId: item.categoryId,
          imageUrl: item.imageUrl,
        }),
      },
      tx,
    );
  });

  if (item.imageUrl) await deleteObject(item.imageUrl, "menu item image");
}

/** Attach an uploaded image to an item. The old one is removed from storage. */
export async function setMenuItemImage(input: {
  readonly itemId: string;
  readonly imageUrl: string;
  readonly actor: OrderActor;
}): Promise<void> {
  const item = await prisma.menuItem.findUnique({
    where: { id: input.itemId },
    select: { imageUrl: true, name: true },
  });
  if (!item) throw ApiError.notFound("That item no longer exists.");

  const previous = item.imageUrl;

  await prisma.$transaction(async (tx) => {
    await tx.menuItem.update({ where: { id: input.itemId }, data: { imageUrl: input.imageUrl } });
    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "admin",
        action: "menu_item.image_changed",
        entityType: "menu_item",
        entityId: input.itemId,
        before: { imageUrl: previous },
        after: { imageUrl: input.imageUrl },
      },
      tx,
    );
  });

  // Only once the row points at the new object. Deleting first would leave the
  // menu showing a broken image if the update then failed.
  if (previous && previous !== input.imageUrl) await deleteObject(previous, "replaced menu item image");
}
