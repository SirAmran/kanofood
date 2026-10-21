import type { Kobo } from "@kanofood/core";
import { prisma } from "@kanofood/db";

import { ApiError } from "../api/http";
import { audit } from "../admin/audit";
import {
  createCategory,
  createMenuItem,
  deleteMenuItem,
  setMenuItemAvailable,
  setMenuItemImage,
  updateCategory,
  updateMenuItem,
  type MenuItemInput,
  type MenuItemPatch,
} from "../admin/menu";
import type { OrderActor } from "../admin/orders";

/**
 * The kitchen's own menu. Screens 5.5 and 5.6 in docs/UX_SPEC.md.
 *
 * The writes are the admin menu service with two extra things attached: the
 * actor is recorded as `kitchen_staff`, and the caller's kitchen is passed as a
 * scope so a request cannot edit another kitchen's row by knowing its id. The
 * logic itself lives in one place, which matters more here than usual: a price
 * edited from either interface must be parsed, validated and audited the same
 * way, and a second implementation is how those two drift apart.
 */

export interface KitchenMenuItemRow {
  readonly id: string;
  readonly categoryId: string;
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
  readonly items: readonly KitchenMenuItemRow[];
}

export async function loadKitchenMenu(kitchenId: string): Promise<readonly KitchenMenuCategory[]> {
  const categories = await prisma.menuCategory.findMany({
    where: { kitchenId },
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
          categoryId: true,
          name: true,
          description: true,
          priceKobo: true,
          imageUrl: true,
          isAvailable: true,
          sortOrder: true,
        },
      },
    },
  });

  return categories;
}

export interface KitchenMenuItemDetail extends KitchenMenuItemRow {
  readonly categories: readonly { readonly id: string; readonly name: string }[];
}

export async function loadKitchenMenuItem(input: {
  readonly kitchenId: string;
  readonly itemId: string;
}): Promise<KitchenMenuItemDetail | null> {
  const [item, categories] = await Promise.all([
    prisma.menuItem.findFirst({
      where: { id: input.itemId, kitchenId: input.kitchenId },
      select: {
        id: true,
        categoryId: true,
        name: true,
        description: true,
        priceKobo: true,
        imageUrl: true,
        isAvailable: true,
        sortOrder: true,
      },
    }),
    prisma.menuCategory.findMany({
      where: { kitchenId: input.kitchenId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  if (!item) return null;
  return { ...item, categories };
}

/** Everything the admin menu service needs from a kitchen caller. */
function writer(kitchenId: string, actor: OrderActor): OrderActor & {
  actorRole: "kitchen_staff";
  kitchenId: string;
} {
  return { ...actor, actorRole: "kitchen_staff", kitchenId };
}

export function createOwnCategory(input: {
  readonly kitchenId: string;
  readonly name: string;
  readonly sortOrder?: number;
  readonly actor: OrderActor;
}): Promise<string> {
  return createCategory({
    kitchenId: input.kitchenId,
    name: input.name,
    sortOrder: input.sortOrder,
    actor: writer(input.kitchenId, input.actor),
  });
}

export function updateOwnCategory(input: {
  readonly kitchenId: string;
  readonly categoryId: string;
  readonly patch: { readonly name?: string; readonly sortOrder?: number; readonly isActive?: boolean };
  readonly actor: OrderActor;
}): Promise<void> {
  return updateCategory({
    categoryId: input.categoryId,
    patch: input.patch,
    actor: writer(input.kitchenId, input.actor),
  });
}

export function createOwnItem(input: {
  readonly kitchenId: string;
  readonly item: MenuItemInput;
  readonly actor: OrderActor;
}): Promise<string> {
  return createMenuItem({
    kitchenId: input.kitchenId,
    item: input.item,
    actor: writer(input.kitchenId, input.actor),
  });
}

export function updateOwnItem(input: {
  readonly kitchenId: string;
  readonly itemId: string;
  readonly patch: MenuItemPatch;
  readonly actor: OrderActor;
}): Promise<void> {
  return updateMenuItem({
    itemId: input.itemId,
    patch: input.patch,
    actor: writer(input.kitchenId, input.actor),
  });
}

export function setOwnItemAvailable(input: {
  readonly kitchenId: string;
  readonly itemId: string;
  readonly isAvailable: boolean;
  readonly actor: OrderActor;
}): Promise<void> {
  return setMenuItemAvailable({
    itemId: input.itemId,
    isAvailable: input.isAvailable,
    actor: writer(input.kitchenId, input.actor),
  });
}

export function deleteOwnItem(input: {
  readonly kitchenId: string;
  readonly itemId: string;
  readonly actor: OrderActor;
}): Promise<void> {
  return deleteMenuItem({ itemId: input.itemId, actor: writer(input.kitchenId, input.actor) });
}

export function setOwnItemImage(input: {
  readonly kitchenId: string;
  readonly itemId: string;
  readonly imageUrl: string;
  readonly actor: OrderActor;
}): Promise<void> {
  return setMenuItemImage({
    itemId: input.itemId,
    imageUrl: input.imageUrl,
    actor: writer(input.kitchenId, input.actor),
  });
}

/**
 * Move a dish one place up or down inside its own section. Screen 5.6's
 * ordering, delivered as buttons rather than drag and drop.
 *
 * Positions are renumbered 0..n-1 across the whole section rather than swapping
 * two values. Swapping is wrong whenever both dishes share a `sort_order`, which
 * is what every dish added through the form gets when the field is left blank,
 * and two identical numbers have no order between them to swap.
 *
 * One audit entry is written for the move, against the dish that moved, not one
 * per renumbered row: the operator did one thing, and the ledger should say one
 * thing rather than fifty.
 */
export async function moveOwnItem(input: {
  readonly kitchenId: string;
  readonly itemId: string;
  readonly direction: "up" | "down";
  readonly actor: OrderActor;
}): Promise<void> {
  const item = await prisma.menuItem.findFirst({
    where: { id: input.itemId, kitchenId: input.kitchenId },
    select: { id: true, categoryId: true, name: true },
  });
  if (!item) throw ApiError.notFound("That dish is not on this kitchen's menu.");

  const siblings = await prisma.menuItem.findMany({
    where: { kitchenId: input.kitchenId, categoryId: item.categoryId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, sortOrder: true },
  });

  const from = siblings.findIndex((row) => row.id === item.id);
  const to = input.direction === "up" ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= siblings.length) return;

  const reordered = [...siblings];
  const [moved] = reordered.splice(from, 1);
  if (!moved) return;
  reordered.splice(to, 0, moved);

  await prisma.$transaction(async (tx) => {
    for (const [position, row] of reordered.entries()) {
      if (row.sortOrder === position) continue;
      await tx.menuItem.update({ where: { id: row.id }, data: { sortOrder: position } });
    }

    await audit(
      {
        actorUserId: input.actor.userId,
        actorRole: "kitchen_staff",
        action: "menu_item.reordered",
        entityType: "menu_item",
        entityId: item.id,
        before: { position: from, sortOrder: siblings[from]?.sortOrder ?? null },
        after: { position: to, sortOrder: to },
      },
      tx,
    );
  });
}
