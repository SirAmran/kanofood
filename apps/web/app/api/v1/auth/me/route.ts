import { prisma } from "@kanofood/db";

import { ApiError } from "@/lib/api/http";
import { staffRoute } from "@/lib/api/route";

/**
 * `GET /api/v1/auth/me` — who the caller is, according to the server.
 *
 * This exists so a client never has to trust its own idea of the role it holds.
 * The role returned is read from the database on the strength of a signed token,
 * not from anything the browser stored, so a UI that hides an admin button based
 * on this value is hiding it for the right reason.
 *
 * `staffRoute` with no roles means any signed-in account, which is the point:
 * every role needs to be able to ask this question about itself.
 */

export const dynamic = "force-dynamic";

export const GET = staffRoute({
  handler: async ({ actor }) => {
    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { id: true, name: true, role: true, phone: true, email: true, isActive: true },
    });

    /**
     * A valid token for a user who is gone or deactivated. The token is not
     * wrong, the account is: this is what deactivating someone has to do, and
     * the refusal is an unauthorised rather than a not-found so a client treats
     * it as "sign in again" instead of "you typed the URL wrong".
     */
    if (!user || !user.isActive) {
      throw ApiError.unauthorised("This account is no longer active.");
    }

    return {
      id: user.id,
      name: user.name,
      role: user.role,
      phone: user.phone,
      email: user.email,
      sessionId: actor.sessionId,
    };
  },
});
