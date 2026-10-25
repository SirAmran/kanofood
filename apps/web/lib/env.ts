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
 * Access token lifetime for an admin, which is deliberately shorter.
 *
 * UX_SPEC section 7.1: admin sessions are the most protected of the four. An
 * admin can cancel a live order, suspend a rider and move money, so the window
 * in which a stolen access token is useful is the window that matters most. The
 * refresh token still lasts its full thirty days, so the cost of the shorter
 * lifetime is a token exchange in the background, not a person signing in again.
 */
export function adminTokenTtl(): string {
  return process.env.ADMIN_TOKEN_TTL?.trim() || "5m";
}

/** The lifetime that applies to this role. */
export function authTokenTtlFor(role: string): string {
  return role === "admin" ? adminTokenTtl() : authTokenTtl();
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

/**
 * Object storage. ARCHITECTURE.md section 9, decided 2026-10-08.
 *
 * `STORAGE_KEY` is the Supabase project URL and `STORAGE_SECRET` is the
 * service_role key. The secret is server side only: it is held here, read by
 * `lib/storage.ts`, and never sent to a browser or given write access to
 * `storage.objects`. The publishable key cannot write anything, by design.
 */
export function storageProvider(): string {
  return process.env.STORAGE_PROVIDER?.trim().toLowerCase() || "supabase";
}

export function storageProjectUrl(): string {
  return required("STORAGE_KEY").replace(/\/+$/, "");
}

export function storageServiceKey(): string {
  return required("STORAGE_SECRET");
}

/**
 * The number customers call, and the one the storefront prints.
 *
 * UX_SPEC asks for a platform contact on four screens: the delivery strip on
 * home (4.1), the fallback when a kitchen's page fails (4.4), the refusal when a
 * point is outside every zone (4.8), and help and contact (4.13). It is the
 * answer for everything the platform has not automated yet, and at launch that
 * is most things: confirmation is a phone call, so a customer who cannot find
 * this number cannot order.
 *
 * Optional, and it returns `null` rather than throwing. A missing support number
 * must not be the reason the storefront fails to render, so each screen hides
 * the line instead. It is also the reason this is not in `.env` yet: the number
 * has not been chosen, and a placeholder that reaches a real customer is worse
 * than an absent line.
 */
export function platformPhone(): string | null {
  return optional("PLATFORM_PHONE");
}

/** A second channel, used where a customer would rather type than talk. */
export function platformWhatsApp(): string | null {
  return optional("PLATFORM_WHATSAPP");
}

function optional(name: string): string | null {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/**
 * Turn a configured lifetime into seconds.
 *
 * An unreadable value falls back rather than throwing. A typo in a lifetime
 * should not be the reason nobody can sign in, and the fallback is the
 * documented intent for that role.
 */
function ttlToSeconds(value: string, fallback: number): number {
  const match = /^(\d+)([smhd])?$/.exec(value.trim());
  if (!match) return fallback;

  const amount = Number(match[1]);
  const unit = match[2] ?? "s";
  const seconds = amount * (UNIT_SECONDS[unit] ?? 1);

  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : fallback;
}

/**
 * The access token lifetime in seconds, for the cookie's `maxAge`.
 *
 * jose understands duration strings such as `15m` directly, but a cookie needs a
 * number, and the two must agree or the cookie and the token inside it expire at
 * different times. Parsing the one configured value here keeps them in step.
 */
export function authTokenTtlSeconds(): number {
  return ttlToSeconds(authTokenTtl(), 900);
}

/** The cookie lifetime that applies to this role. Must match the token's own. */
export function authTokenTtlSecondsFor(role: string): number {
  return role === "admin" ? ttlToSeconds(adminTokenTtl(), 300) : authTokenTtlSeconds();
}

/**
 * Email, through Resend. ARCHITECTURE.md sections 8 and 11.
 *
 * `EMAIL_PROVIDER_KEY` is the API key and `EMAIL_FROM` is the verified sender.
 * Both are empty in this repository on purpose: the provider is built to be
 * inert, not disabled, so an unconfigured install records each email as
 * `skipped` with the reason instead of failing an order or a build.
 *
 * Email is **internal only** — admin, kitchen and rider. A customer has no email
 * address in this data model at all (section 7: no customer accounts in V1), and
 * a test in core holds the rule. Nothing here should ever grow a customer path.
 */
export function resendApiKey(): string | null {
  return optional("EMAIL_PROVIDER_KEY");
}

export function emailFrom(): string | null {
  return optional("EMAIL_FROM");
}

/**
 * Web Push. ARCHITECTURE.md sections 8 and 11.
 *
 * The VAPID pair identifies this application to the browser's push service. The
 * subject is the contact address a push service can use if this sender
 * misbehaves; web-push requires a `mailto:` or `https:` value, so the fallback
 * is a local address rather than an empty string that would throw at send time.
 *
 * Empty keys mean no push can be sent, which is the same inert state email has.
 * The public key is also served to the browser so it can subscribe, so it is
 * read on a request path and must not throw when absent.
 */
export function pushVapidPublicKey(): string | null {
  return optional("PUSH_VAPID_PUBLIC_KEY");
}

export function pushVapidPrivateKey(): string | null {
  return optional("PUSH_VAPID_PRIVATE_KEY");
}

export function pushVapidSubject(): string {
  return optional("PUSH_VAPID_SUBJECT") ?? "mailto:notifications@kanofood.local";
}

