/**
 * The per-process database pool size. Phase 10, docs/ARCHITECTURE.md section 10.
 *
 * Serverless functions plus Postgres is the one hazard the architecture names by
 * name: every function instance that opens its own pool multiplies the connection
 * count, and the database provider refuses the last one. The pooled connection
 * string solves half of it; this number solves the other half.
 *
 * Three is deliberate rather than round. A Netlify function handles one request
 * at a time, but a single request can fire several Prisma queries in parallel
 * (the home screen composes its rails that way), so a pool of one would serialise
 * work that is already concurrent. Three covers that burst and stays small enough
 * that a fleet of instances cannot walk into the provider's limit. The arithmetic
 * the operator has to respect is in `docs/DEPLOYMENT.md`: instances x this number
 * must stay below the provider's connection ceiling.
 *
 * An invalid value falls back rather than throwing. A typo in an optional tuning
 * knob should not be the reason the application cannot reach its database, and
 * the fallback is the small, safe value. The bounds keep a typo like `300` from
 * becoming a fleet-wide outage: the largest value accepted is still per instance.
 */

/** Enough for a request's parallel queries, small enough for a fleet. */
export const DEFAULT_POOL_MAX = 3;

/** The most a single instance may be told to open. */
const MAX_POOL_MAX = 20;

export function databasePoolMax(): number {
  const configured = process.env.DATABASE_POOL_MAX?.trim();
  if (!configured) return DEFAULT_POOL_MAX;

  const parsed = Number(configured);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_POOL_MAX) {
    return DEFAULT_POOL_MAX;
  }

  return parsed;
}
