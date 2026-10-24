import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@kanofood/db";

import { ACCESS_COOKIE } from "../auth/guard";
import { verifyAccessToken } from "../auth/tokens";

/**
 * The page-side rider guard.
 *
 * `requireActor(req, ["rider"])` protects the API. This protects a rendered
 * page, and it resolves the thing the token cannot: the `rider` row this person
 * owns. The token carries a user id and a role; the rider row carries the name
 * and phone a delivery card reads, and it is the row every query is scoped by.
 *
 * It fails closed at every step, for the same reasons the kitchen guard does:
 * no cookie, another role's token, an inactive user, no rider row, or a rider
 * deactivated by an admin all resolve to `null`. Deactivation matters here more
 * than anywhere else, because a rider who has been stood down must stop seeing
 * customers' addresses the moment it happens rather than when their token
 * expires.
 *
 * The rider row is re-read rather than trusted from the token, so an admin can
 * end a rider's access without waiting out a session.
 */

export const RIDER_SIGN_IN_PATH = "/rider/sign-in";

export interface RiderActor {
  readonly userId: string;
  readonly sessionId: string;
  readonly role: "rider";
  /** The `riders` row id. Every query and write is scoped by this. */
  readonly riderId: string;
  readonly name: string;
  readonly phone: string;
  readonly vehicle: string | null;
  /** False when an admin has deactivated the rider. Writes are refused. */
  readonly isActive: boolean;
}

/** Resolve the signed-in rider, or null. Does not redirect. */
export async function getRiderActor(): Promise<RiderActor | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifyAccessToken(token);
  if (!claims || claims.role !== "rider") return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: {
      id: true,
      role: true,
      isActive: true,
      rider: {
        select: { id: true, name: true, phone: true, vehicle: true, isActive: true },
      },
    },
  });

  // Role re-read from the row, not the token: a token says what was true when
  // it was signed, and an admin can change someone's role after that.
  if (!user || !user.isActive || user.role !== "rider") return null;
  if (!user.rider) return null;

  return {
    userId: user.id,
    sessionId: claims.sessionId,
    role: "rider",
    riderId: user.rider.id,
    name: user.rider.name,
    phone: user.rider.phone,
    vehicle: user.rider.vehicle,
    isActive: user.rider.isActive,
  };
}

/** The signed-in rider, or a redirect to sign-in. */
export async function requireRider(): Promise<RiderActor> {
  const actor = await getRiderActor();
  if (!actor) redirect(RIDER_SIGN_IN_PATH);
  return actor;
}
