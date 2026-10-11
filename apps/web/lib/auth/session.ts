import { prisma } from "@kanofood/db";

import { REFRESH_TOKEN_TTL_DAYS } from "../env";
import {
  type StaffRole,
  hashRefreshToken,
  newRefreshToken,
  signAccessToken,
} from "./tokens";

/**
 * Sessions, which are how a refresh token can be revoked.
 *
 * A stateless JWT cannot be revoked, which is why the specification pairs a
 * short access token with a row in `sessions`. The access token is the cheap
 * path and the row is the kill switch.
 */

export interface SessionMeta {
  readonly userAgent?: string | null;
  readonly ip?: string | null;
}

export interface IssuedTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  /**
   * The role the tokens were issued for.
   *
   * Returned so the caller can set the access cookie's `maxAge` from the same
   * role that picked the token's lifetime. The two are set in different places,
   * and a cookie outliving its token (or the reverse) is the kind of drift that
   * only shows up as a mystery sign-out.
   */
  readonly role: StaffRole;
}

function refreshExpiry(): Date {
  const expires = new Date();
  expires.setDate(expires.getDate() + REFRESH_TOKEN_TTL_DAYS);
  return expires;
}

/** Open a session for a user and return the token pair. */
export async function startSession(
  userId: string,
  role: StaffRole,
  meta: SessionMeta,
): Promise<IssuedTokens> {
  const { token, hash } = newRefreshToken();

  const session = await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hash,
      expiresAt: refreshExpiry(),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    },
    select: { id: true },
  });

  const accessToken = await signAccessToken({ userId, role, sessionId: session.id });
  return { accessToken, refreshToken: token, role };
}

/**
 * Exchange a refresh token for a new pair, revoking the one presented.
 *
 * Rotation means a stolen refresh token is usable at most once, and that its use
 * is detectable: the legitimate client still holds the old token, so when the
 * thief presents it first and the real client presents it second, the second
 * presentation is a *reuse* of a revoked token.
 *
 * Reuse is therefore treated as a compromise signal rather than a bad request.
 * Every session for that user is revoked, which signs the real user out as well
 * and is the correct trade: a forced re-login costs one password, and the
 * alternative is an attacker holding a session indefinitely.
 */
export async function rotateSession(
  refreshToken: string,
  meta: SessionMeta,
): Promise<IssuedTokens | null> {
  const hash = hashRefreshToken(refreshToken);

  const existing = await prisma.session.findUnique({
    where: { refreshTokenHash: hash },
    select: {
      id: true,
      userId: true,
      revokedAt: true,
      expiresAt: true,
      user: { select: { role: true, isActive: true } },
    },
  });

  if (!existing) return null;

  if (existing.revokedAt !== null) {
    await prisma.session.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  if (existing.expiresAt.getTime() <= Date.now()) return null;
  if (!existing.user.isActive) return null;

  const { token, hash: nextHash } = newRefreshToken();
  const role = existing.user.role as StaffRole;

  const created = await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    return tx.session.create({
      data: {
        userId: existing.userId,
        refreshTokenHash: nextHash,
        expiresAt: refreshExpiry(),
        userAgent: meta.userAgent ?? null,
        ip: meta.ip ?? null,
      },
      select: { id: true },
    });
  });

  const accessToken = await signAccessToken({
    userId: existing.userId,
    role,
    sessionId: created.id,
  });

  return { accessToken, refreshToken: token, role };
}

/**
 * Revoke the session a refresh token belongs to.
 *
 * Idempotent: signing out twice, or with a token that has already been rotated
 * away, is a no-op rather than an error. A sign-out that fails is worse than one
 * that does nothing.
 */
export async function endSession(refreshToken: string): Promise<void> {
  const hash = hashRefreshToken(refreshToken);
  await prisma.session.updateMany({
    where: { refreshTokenHash: hash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revoke one session by the id carried in an access token. Used when a refresh
 * token is gone but the caller still holds a valid access token.
 */
export async function revokeSessionById(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
