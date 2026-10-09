import { prisma } from "@kanofood/db";
import { z } from "zod";

import { ApiError, ok } from "@/lib/api/http";
import { clientIp, publicRoute } from "@/lib/api/route";
import { verifyPassword } from "@/lib/auth/password";
import { setAuthCookies } from "@/lib/auth/guard";
import { startSession } from "@/lib/auth/session";
import { REFRESH_TOKEN_TTL_DAYS, authTokenTtlSeconds } from "@/lib/env";

/**
 * `POST /api/v1/auth/sign-in`.
 *
 * One endpoint for every kind of staff account. A customer, a kitchen operator,
 * a rider and an admin all sign in the same way and are separated by the role on
 * their user row, not by which URL they used. Separate sign-in pages per role
 * would multiply the surface that has to get authentication right.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** A phone number or an email address. Whichever the account was made with. */
  identifier: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
});

/**
 * One message for every way this can fail.
 *
 * "No such account" and "wrong password" are the same sentence on purpose.
 * Telling them apart turns sign-in into a way to discover which phone numbers
 * and email addresses hold accounts here, which is the first step of a
 * targeted attack on the people who run kitchens.
 */
const REFUSED = "That phone number or email and password do not match.";

export const POST = publicRoute({
  body: bodySchema,
  handler: async ({ req, body }) => {
    const user = await prisma.user.findFirst({
      where: { OR: [{ phone: body.identifier }, { email: body.identifier }] },
      select: { id: true, role: true, name: true, passwordHash: true, isActive: true },
    });

    /**
     * The password is verified even when no user was found.
     *
     * Skipping the hash when the account is missing would make "no such account"
     * answer in a millisecond and "wrong password" take tens of them, which is
     * the same disclosure the shared message exists to prevent, just in timing
     * instead of words.
     */
    const passwordMatches = await verifyPassword(body.password, user?.passwordHash ?? null);

    if (!user || !user.isActive || !passwordMatches) {
      throw ApiError.unauthorised(REFUSED);
    }

    const tokens = await startSession(user.id, user.role, {
      userAgent: req.headers.get("user-agent"),
      ip: clientIp(req),
    });

    const response = ok({
      user: { id: user.id, name: user.name, role: user.role },
    });

    setAuthCookies(
      response,
      tokens,
      authTokenTtlSeconds(),
      REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
    );

    return response;
  },
});
