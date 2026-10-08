/**
 * Database package.
 *
 * The Prisma client is instantiated once and exported as a singleton. This is
 * not a style preference. Serverless functions plus Postgres is the documented
 * failure mode of this stack: a fresh client per invocation exhausts database
 * connections under load, and Netlify runs each request in its own instance.
 * The pooled connection string and the small per-instance pool both exist to
 * blunt exactly that, and it has to be verified under concurrent load before
 * launch rather than assumed. See docs/ARCHITECTURE.md section 10.
 *
 * In development the instance is cached on `globalThis` so a hot reload does
 * not open a new pool on every file save. In production a new instance would be
 * a new connection, so the cache is left in place there too and the process
 * lifetime is what bounds it.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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
    adapter: new PrismaPg({ connectionString }),
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

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;

export type { Prisma } from "@prisma/client";
export * from "@prisma/client";
