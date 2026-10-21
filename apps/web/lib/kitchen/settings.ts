import { prisma } from "@kanofood/db";

import {
  setKitchenImage,
  setKitchenOpen,
  updateKitchenProfile,
  type KitchenProfileInput,
} from "../admin/kitchens";
import type { OrderActor } from "../admin/orders";

/**
 * A kitchen's own profile and status. Screen 5.7 in docs/UX_SPEC.md.
 *
 * The `kitchenId` always comes from the caller's membership, resolved in
 * `resolveKitchenMembership`, never from the request. That is what makes these
 * wrappers safe: an operator can only ever edit the kitchen they are attached
 * to, and the admin service they delegate to cannot be pointed at another one.
 *
 * The slug and the commission rate are absent on purpose. Both are platform
 * decisions: the slug is addressed by links and configuration, and the rate is
 * the commercial arrangement. A kitchen editing either would be a kitchen
 * setting its own price for being on the platform.
 */

export interface KitchenSettings {
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
  readonly staff: readonly {
    readonly id: string;
    readonly name: string;
    readonly role: "owner" | "staff";
  }[];
}

export async function loadKitchenSettings(kitchenId: string): Promise<KitchenSettings | null> {
  return prisma.kitchen.findUnique({
    where: { id: kitchenId },
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
      staff: {
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, user: { select: { name: true } } },
      },
    },
  }).then((kitchen) =>
    kitchen === null
      ? null
      : {
          ...kitchen,
          staff: kitchen.staff.map((member) => ({
            id: member.id,
            name: member.user.name,
            role: member.role,
          })),
        },
  );
}

export function updateOwnKitchenProfile(input: {
  readonly kitchenId: string;
  readonly patch: KitchenProfileInput;
  readonly actor: OrderActor;
}): Promise<void> {
  return updateKitchenProfile({
    kitchenId: input.kitchenId,
    patch: input.patch,
    actor: input.actor,
    actorRole: "kitchen_staff",
  });
}

/**
 * Open or close for trading.
 *
 * Deliberately open to every member of the kitchen, not only the owner: closing
 * is the one change that has to be possible at 8pm when the owner's phone is
 * off. The admin service already refuses to open a suspended kitchen.
 */
export function setOwnKitchenOpen(input: {
  readonly kitchenId: string;
  readonly isOpen: boolean;
  readonly actor: OrderActor;
}): Promise<void> {
  return setKitchenOpen({
    kitchenId: input.kitchenId,
    isOpen: input.isOpen,
    actor: input.actor,
    actorRole: "kitchen_staff",
  });
}

export function setOwnKitchenImage(input: {
  readonly kitchenId: string;
  readonly kind: "logo" | "cover";
  readonly url: string;
  readonly actor: OrderActor;
}): Promise<void> {
  return setKitchenImage({
    kitchenId: input.kitchenId,
    kind: input.kind,
    url: input.url,
    actor: input.actor,
    actorRole: "kitchen_staff",
  });
}
