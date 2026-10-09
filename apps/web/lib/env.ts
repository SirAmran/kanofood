/**
 * Environment access.
 *
 * Read lazily, at the point of use, rather than captured at module scope. A
 * module-scope read would evaluate during the build, where the secrets are
 * absent on purpose, and fail a build that has no reason to need them.
 *
 * Every getter throws a message naming the variable, because the failure this
 * replaces was a route throwing a Prisma connection error with the credentials
 * sitting on disk the whole time.
 */

function required(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${name} is not set. See .env.example for the name. The repository .env is ` +
        "loaded by apps/web/instrumentation.ts; a host supplies it in production.",
    );
  }
  return value.trim();
}

export function databaseUrl(): string {
  return required("DATABASE_URL");
}

/** HS256 key material for staff access tokens. */
export function authJwtSecret(): Uint8Array {
  return new TextEncoder().encode(required("AUTH_JWT_SECRET"));
}

/**
 * Access token lifetime, minutes not hours. A string jose understands, such as
 * `15m`, so the unit lives in configuration rather than being assumed here.
 */
export function authTokenTtl(): string {
  return process.env.AUTH_TOKEN_TTL?.trim() || "15m";
}

/**
 * Key material for guest order tokens.
 *
 * Separate from the access token secret on purpose: rotating this invalidates
 * every live tracking link and nothing else, so the two must not be the same
 * value or the blast radius of a rotation is the whole platform.
 */
export function orderTokenSecret(): Uint8Array {
  return new TextEncoder().encode(required("ORDER_TOKEN_SECRET"));
}

/** How long a guest tracking link stays valid. */
export const ORDER_TOKEN_TTL = "30d";

/** How long a refresh token stays valid. */
export const REFRESH_TOKEN_TTL_DAYS = 30;

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/**
 * The access token lifetime in seconds, for the cookie's `maxAge`.
 *
 * jose understands duration strings such as `15m` directly, but a cookie needs a
 * number, and the two must agree or the cookie and the token inside it expire at
 * different times. Parsing the one configured value here keeps them in step.
 *
 * An unreadable value falls back to 15 minutes rather than throwing. A typo in
 * a lifetime should not be the reason nobody can sign in, and 15 minutes is the
 * documented intent.
 */
export function authTokenTtlSeconds(): number {
  const match = /^(\d+)([smhd])?$/.exec(authTokenTtl().trim());
  if (!match) return 900;

  const amount = Number(match[1]);
  const unit = match[2] ?? "s";
  const seconds = amount * (UNIT_SECONDS[unit] ?? 1);

  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : 900;
}

