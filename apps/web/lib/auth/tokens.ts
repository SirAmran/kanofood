import { createHash, randomBytes } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

import { ORDER_TOKEN_TTL, authJwtSecret, authTokenTtl, orderTokenSecret } from "../env";

/**
 * The three token kinds this system issues, and why they are three rather than
 * one.
 *
 * - **Access token**: a short-lived JWT carrying who the caller is and which
 *   session it belongs to. Stateless, so a request costs no database round trip
 *   to authorise.
 * - **Refresh token**: an opaque random string, never a JWT. It carries nothing
 *   because it needs to carry nothing, and being opaque means a leaked one
 *   reveals no claims. Only its hash is stored, so a database dump yields
 *   nothing usable.
 * - **Guest order token**: a JWT scoped to a single order, for a customer who
 *   has no account. Signed with its own secret so rotating it invalidates
 *   tracking links and nothing else.
 */

export type StaffRole = "customer" | "kitchen_staff" | "rider" | "admin";

const STAFF_ISSUER = "kanofood";
const STAFF_AUDIENCE = "kanofood-staff";
const ORDER_AUDIENCE = "kanofood-order";

export interface AccessTokenClaims {
  readonly userId: string;
  readonly role: StaffRole;
  readonly sessionId: string;
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ role: claims.role, sid: claims.sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.userId)
    .setIssuer(STAFF_ISSUER)
    .setAudience(STAFF_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(authTokenTtl())
    .sign(authJwtSecret());
}

/**
 * Verify an access token.
 *
 * Returns null for anything that does not verify, including expired, tampered,
 * wrong-audience and wrong-secret tokens. The caller gets no reason, because
 * distinguishing them serves an attacker and not a legitimate client.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, authJwtSecret(), {
      issuer: STAFF_ISSUER,
      audience: STAFF_AUDIENCE,
      algorithms: ["HS256"],
    });

    const userId = payload.sub;
    const role = payload.role;
    const sessionId = payload.sid;

    if (typeof userId !== "string" || typeof sessionId !== "string") return null;
    if (role !== "customer" && role !== "kitchen_staff" && role !== "rider" && role !== "admin") {
      return null;
    }

    return { userId, role, sessionId };
  } catch {
    return null;
  }
}

/** A fresh opaque refresh token, and the hash to store for it. */
export function newRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}

/**
 * SHA-256, not a password hash. A refresh token is 256 bits of server-generated
 * randomness, so there is no guessing to slow down and no need for a KDF.
 */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface OrderTokenClaims {
  /** The customer-facing order number, which is what a tracking URL carries. */
  readonly orderNumber: string;
}

/**
 * Issue a guest tracking token for one order.
 *
 * The scope claim is what makes this safe: the token names exactly one order,
 * so it cannot be widened into a listing of someone else's orders by editing a
 * URL. It proves possession of the link, nothing more.
 */
export async function signOrderToken(claims: OrderTokenClaims): Promise<string> {
  return new SignJWT({ scope: "order" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.orderNumber)
    .setIssuer(STAFF_ISSUER)
    .setAudience(ORDER_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ORDER_TOKEN_TTL)
    .sign(orderTokenSecret());
}

export async function verifyOrderToken(token: string): Promise<OrderTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, orderTokenSecret(), {
      issuer: STAFF_ISSUER,
      audience: ORDER_AUDIENCE,
      algorithms: ["HS256"],
    });

    if (payload.scope !== "order") return null;
    if (typeof payload.sub !== "string") return null;

    return { orderNumber: payload.sub };
  } catch {
    return null;
  }
}
