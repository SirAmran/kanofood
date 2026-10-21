import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@kanofood/db";

import { ACCESS_COOKIE } from "../auth/guard";
import { verifyAccessToken } from "../auth/tokens";

/**
 * The page-side kitchen guard.
 *
 * `requireActor(req, ["kitchen_staff"])` protects the API. This protects a
 * rendered page, and it does the one thing the token cannot: it resolves *which
 * kitchen* this person works in. The token carries a user id and a role; it does
 * not carry a kitchen, because a membership can be removed while the token is
 * still alive, and a kitchen id inside a signed token would keep working after
 * the admin who removed it had done so.
 *
 * It fails closed at every step: no cookie, a token for another role, a user
 * that is no longer active, no membership, or a membership whose kitchen has
 * been deleted all resolve to `null`.
 *
 * **One kitchen per account in V1.** The schema allows a person to be on staff
 * at several kitchens, and the order the memberships are read in is stable (oldest
 * first), so which one a multi-kitchen account opens is at least deterministic.
 * The kitchen interface does not yet offer a switcher; when one is needed, this
 * is the function that gains it, and every screen below is already scoped by
 * whatever kitchen it returns.
 */

export const KITCHEN_SIGN_IN_PATH = "/kitchen/sign-in";

export interface KitchenActor {
  readonly userId: string;
  readonly sessionId: string;
  readonly role: "kitchen_staff";
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly kitchenId: string;
  readonly kitchenName: string;
  readonly kitchenSlug: string;
  /** The membership role, `owner` or `staff`. Presentation only in V1. */
  readonly isOwner: boolean;
  /** False when an admin has suspended the kitchen. Writes are refused. */
  readonly kitchenIsActive: boolean;
}

/** Resolve the signed-in kitchen operator, or null. Does not redirect. */
export async function getKitchenActor(): Promise<KitchenActor | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifyAccessToken(token);
  if (!claims || claims.role !== "kitchen_staff") return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: {
      id: true,
      role: true,
      isActive: true,
      name: true,
      email: true,
      phone: true,
      kitchenUsers: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          role: true,
          kitchen: {
            select: { id: true, name: true, slug: true, isActive: true },
          },
        },
      },
    },
  });

  // The role is re-read from the row rather than trusted from the token, for the
  // same reason the admin guard does it: a token says what was true when it was
  // signed, and an admin can remove a person from a kitchen after that.
  if (!user || !user.isActive || user.role !== "kitchen_staff") return null;

  const membership = user.kitchenUsers[0];
  if (!membership) return null;

  return {
    userId: user.id,
    sessionId: claims.sessionId,
    role: "kitchen_staff",
    name: user.name,
    email: user.email,
    phone: user.phone,
    kitchenId: membership.kitchen.id,
    kitchenName: membership.kitchen.name,
    kitchenSlug: membership.kitchen.slug,
    isOwner: membership.role === "owner",
    kitchenIsActive: membership.kitchen.isActive,
  };
}

/** The signed-in kitchen operator, or a redirect to sign-in. */
export async function requireKitchen(): Promise<KitchenActor> {
  const actor = await getKitchenActor();
  if (!actor) redirect(KITCHEN_SIGN_IN_PATH);
  return actor;
}
