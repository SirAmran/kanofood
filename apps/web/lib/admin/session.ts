import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { StaffRole } from "../auth/tokens";
import { ACCESS_COOKIE } from "../auth/guard";
import { verifyAccessToken } from "../auth/tokens";
import { prisma } from "@kanofood/db";

/**
 * The page-side admin guard.
 *
 * `requireActor` in `lib/auth/guard.ts` protects the API. This protects a
 * rendered page, and the two are separate on purpose: a protected page is not a
 * security boundary, it is a courtesy, and the data behind it is protected by
 * the API and by the queries the page itself runs.
 *
 * It fails closed and it re-checks the database. A signed token proves a session
 * existed when it was issued; it does not prove the account is still active or
 * still an admin. Suspending a member of staff has to take effect now, not in
 * whatever is left of their token's lifetime, so one primary-key read is worth
 * the round trip.
 *
 * Admin access tokens are short lived by design (UX_SPEC section 7.1, and
 * `authTokenTtlFor` in lib/env.ts). The shell keeps them fresh from the browser
 * with `SessionKeepAlive`, so the short lifetime costs a background exchange
 * rather than a second sign-in. This function deliberately does NOT try to
 * refresh: a React Server Component cannot set a cookie, so attempting it here
 * would fail on the one path that matters.
 */

export const SIGN_IN_PATH = "/admin/sign-in";

export interface AdminActor {
  readonly userId: string;
  readonly sessionId: string;
  readonly role: StaffRole;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
}

/** Resolve the signed-in admin, or null. Does not redirect. */
export async function getAdmin(): Promise<AdminActor | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifyAccessToken(token);
  if (!claims || claims.role !== "admin") return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, role: true, isActive: true, name: true, email: true, phone: true },
  });

  // The role is re-read rather than trusted from the token. A token says what
  // was true when it was signed; this says what is true now.
  if (!user || !user.isActive || user.role !== "admin") return null;

  return {
    userId: user.id,
    sessionId: claims.sessionId,
    role: "admin",
    name: user.name,
    email: user.email,
    phone: user.phone,
  };
}

/**
 * The signed-in admin, or a redirect to sign-in.
 *
 * Every screen in the admin shell starts with this. A screen that forgets it
 * renders nothing rather than rendering data, because there is no other way for
 * a queried row to reach the page: the queries need the actor they are given
 * here.
 */
export async function requireAdmin(): Promise<AdminActor> {
  const admin = await getAdmin();
  if (!admin) redirect(SIGN_IN_PATH);
  return admin;
}
