import { prisma } from "@kanofood/db";

/**
 * The network: the kitchens and the riders.
 *
 * Split out from the screens that read it because three of them do. The orders
 * filters need both lists to populate a dropdown, screen 7.5 needs the kitchens
 * with their counters, and screen 7.6 needs the riders with theirs. A page that
 * queried its own dropdown options would be a fourth place the same select
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
