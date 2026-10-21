import type { Kobo } from "@kanofood/core";
import { prisma } from "@kanofood/db";

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
