import type { NextRequest, NextResponse } from "next/server";

import { ApiError } from "../api/http";
import { type StaffRole, verifyAccessToken } from "./tokens";

/**
 * Who is making this request, and are they allowed to.
 *
 * Authorisation is decided here, on the server, from a signed token. Nothing the
 * client sends about its own role is read, ever. A client-side role check hides
 * a button; this is what protects the data.
 *
 * It fails closed: a missing cookie, an unparseable token, an expired token and
 * a role that is not in the allowed list all end in a refusal. There is no path
 * where a failure to determine the role results in allowing the request.
 */

export const ACCESS_COOKIE = "kf_access";
export const REFRESH_COOKIE = "kf_refresh";

export interface Actor {
  readonly userId: string;
  readonly role: StaffRole;
  readonly sessionId: string;
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    // Secure cookies are refused over plain HTTP, and development is plain HTTP
    // on localhost. Production is HTTPS only, so the flag is on there.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function setAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
  accessMaxAgeSeconds: number,
  refreshMaxAgeSeconds: number,
): void {
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, cookieOptions(accessMaxAgeSeconds));
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(refreshMaxAgeSeconds));
}

export function clearAuthCookies(response: NextResponse): void {
  const expired = { ...cookieOptions(0), maxAge: 0 };
  response.cookies.set(ACCESS_COOKIE, "", expired);
  response.cookies.set(REFRESH_COOKIE, "", expired);
}

/**
 * Resolve the caller, or null when there is no valid session.
 *
 * Returns null rather than throwing so a route can offer anonymous behaviour
 * where that is legitimate, such as the public quote endpoint.
 */
export async function getActor(req: NextRequest): Promise<Actor | null> {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifyAccessToken(token);
  if (!claims) return null;

  return { userId: claims.userId, role: claims.role, sessionId: claims.sessionId };
}

/**
 * Resolve the caller, refusing the request when that is not possible.
 *
 * `roles` is optional: omitted means any authenticated staff member, which is
 * what `/api/v1/auth/me` needs.
 */
export async function requireActor(req: NextRequest, roles?: readonly StaffRole[]): Promise<Actor> {
  const actor = await getActor(req);
  if (!actor) throw ApiError.unauthorised();

  if (roles && !roles.includes(actor.role)) {
    // Deliberately not "your role is X": telling a caller what role they hold
    // and what was expected helps them probe for one that works.
    throw ApiError.forbidden();
  }

  return actor;
}
