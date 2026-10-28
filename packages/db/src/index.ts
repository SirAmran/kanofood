/**
 * Database package.
 *
 * The Prisma client is instantiated once, on first use, and exported as a
 * singleton. This is not a style preference. Serverless functions plus Postgres
 * is the documented failure mode of this stack: a fresh client per invocation
 * exhausts database connections under load, and Netlify runs each request in its
 * own instance. The pooled connection string and the small per-instance pool
 * both exist to blunt exactly that, and it has to be verified under concurrent
 * load before launch rather than assumed. See docs/ARCHITECTURE.md section 10.
 *
 * In development the instance is cached on `globalThis` so a hot reload does
 * not open a new pool on every file save. In production a new instance would be
 * a new connection, so the cache is left in place there too and the process
 * lifetime is what bounds it.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { databasePoolMax } from "./pool.ts";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma 7 does not open a database connection by itself any more. The client
 * is handed a driver adapter, and this one owns a `pg` pool against
 * DATABASE_URL, the pooled connection string. That pool is what the pooled
 * string exists for; the reasoning above is unchanged.
 *
 * The adapter is built inside this factory rather than at module scope so a
 * development hot reload, which re-evaluates this file, cannot open a second
 * pool while the cached client below still holds the first.
 */
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. The database package cannot connect without it; see .env.example.",
    );
  }

  return new PrismaClient({
    /**
     * The adapter owns a `pg` pool, and its size is the mitigation section 10
     * asks for. Prisma's own pool would default to a much larger number, which
     * is exactly the fleet-wide exhaustion the pooled URL exists to avoid.
     *
     * `connectionTimeoutMillis` matters as much as `max`: with a saturated
     * database an unbounded wait turns a slow response into a request that never
     * finishes and holds its function instance open. Ten seconds fails the query
     * while the request can still answer. Idle clients are released so a quiet
     * instance does not sit on connections the next instance needs.
     */
    adapter: new PrismaPg({
      connectionString,
      max: databasePoolMax(),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      allowExitOnIdle: true,
    }),
    /**
     * Query logging in development only. A query log is disk traffic, and this
     * machine pages onto a 5400rpm drive measured at 94% busy, so it is off
     * everywhere else. No new environment variable was invented for this:
     * NODE_ENV is already the switch for it.
     */
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });
}

/**
 * The cached client, created on first use.
 *
 * Reading the cache before creating is what makes the guarantee above survive:
 * one client per process, and a hot reload reuses the one already there instead
 * of opening a second pool.
 */
function getPrismaClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing) return existing;

  const created = createPrismaClient();
  globalForPrisma.prisma = created;
  return created;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  /**
   * Construct the client on first use, not on import.
   *
   * `next build` evaluates every route module to collect its config, so an
   * eager client here made the build require database credentials it never
   * used. That fails a fresh clone, and it would put production credentials
   * into a CI or deploy-preview build for no reason. Nothing about the
   * singleton guarantee above changes: the client is still created once per
   * process and cached on `globalThis`, and the first query opens the pool
   * exactly as before.
   *
   * A Proxy rather than a `getPrisma()` function so every existing
   * `prisma.kitchen.findFirst(...)` call site stays as it is. The receiver is
   * the real client, not this proxy, and functions are bound to it: Prisma's
   * methods live on the prototype, so an unbound one would be invoked with
   * `this` set to the proxy and lose the private state it needs.
   */
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/**
 * `Prisma` is exported as a value, not only as a type.
 *
 * The namespace carries runtime members alongside its types, and two of them are
 * needed: `Prisma.JsonNull` to write a JSON column as SQL NULL, and
 * `Prisma.InputJsonValue` to type what goes into one. A type-only export would
 * make both unusable, and it would also shadow the one that `export *` below
 * already provides.
 */
export { Prisma } from "@prisma/client";
export * from "@prisma/client";
