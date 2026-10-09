import type { NextResponse } from "next/server";

import { ApiError, failure, ok } from "@/lib/api/http";
import { clientIp, publicRoute } from "@/lib/api/route";
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from "@/lib/auth/guard";
import { rotateSession } from "@/lib/auth/session";
import { REFRESH_TOKEN_TTL_DAYS, authTokenTtlSeconds } from "@/lib/env";

/**
 * `POST /api/v1/auth/refresh` — trade a refresh token for a new pair.
 *
 * Needs no access token, because the whole point is that the access token has
 * expired. The refresh cookie is the credential, and it is the only thing read.
 */

export const dynamic = "force-dynamic";

/**
 * One refusal for every way this can fail: no cookie, an unknown token, an
 * expired one, a revoked one, a reused one.
 *
 * The distinction is deliberately not drawn. `rotateSession` has already revoked
 * every session for that user when it detected reuse, and a caller holding a
 * stolen token learns nothing about whether it was ever real. The caller's only
 * useful move is to sign in again, and that is all this says.
 *
 * The cookies are cleared on the way out. A client that keeps a dead refresh
 * cookie retries forever instead of sending the user to sign in, and the token
 * that just failed is not one to present again.
 */
function refuse(): NextResponse {
  const response = failure(ApiError.unauthorised("Your session has ended. Sign in again."));
  clearAuthCookies(response);
  return response;
}

export const POST = publicRoute({
  handler: async ({ req }) => {
    const presented = req.cookies.get(REFRESH_COOKIE)?.value;
    if (!presented) return refuse();

    const tokens = await rotateSession(presented, {
      userAgent: req.headers.get("user-agent"),
      ip: clientIp(req),
    });
    if (!tokens) return refuse();

    const response = ok({ refreshed: true });
    setAuthCookies(
      response,
      tokens,
      authTokenTtlSeconds(),
      REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
    );

    return response;
  },
});
