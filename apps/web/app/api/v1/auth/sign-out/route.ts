import { ok } from "@/lib/api/http";
import { publicRoute } from "@/lib/api/route";
import { REFRESH_COOKIE, clearAuthCookies } from "@/lib/auth/guard";
import { endSession } from "@/lib/auth/session";

/**
 * `POST /api/v1/auth/sign-out`.
 *
 * Public, and never fails. Signing out is the one action that must work with an
 * expired access token, a revoked session, a rotated refresh token or no cookie
 * at all: a user who cannot sign out is stuck on a shared device, and a client
 * that has to handle an error here will end up leaving the session open.
 *
 * The cookies are cleared on every path. If the server-side revocation did fail,
 * the browser still stops presenting the tokens.
 */

export const dynamic = "force-dynamic";

export const POST = publicRoute({
  handler: async ({ req }) => {
    const presented = req.cookies.get(REFRESH_COOKIE)?.value;

    if (presented) {
      try {
        await endSession(presented);
      } catch (cause) {
        // Logged, not surfaced. The caller is signing out; there is nothing for
        // them to do about a database fault, and the cookies are cleared below
        // regardless.
        console.error("[auth] sign-out could not revoke the session", cause);
      }
    }

    const response = ok({ signedOut: true });
    clearAuthCookies(response);
    return response;
  },
});
