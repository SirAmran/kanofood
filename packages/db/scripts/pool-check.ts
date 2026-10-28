/**
 * The pool check. Phase 10, docs/ARCHITECTURE.md section 10.
 *
 * Section 10 says the serverless-plus-Postgres hazard "must be verified under
 * concurrent load before launch rather than assumed". This is that verification.
 * It sends concurrent requests at a running application, samples the database's
 * own `pg_stat_activity` while they are in flight, and fails when more
 * connections were opened than the configured pool permits.
 *
 *   POOL_CHECK_URL=https://kanofood.example npm run db:pool-check
 *
 * Against local development, `POOL_CHECK_URL` can be omitted and it defaults to
 * `http://localhost:3000`; start the app first with `npm run dev`.
 *
 * `POOL_CHECK_MAX_CONNECTIONS` is the ceiling the provider gives you, or the
 * fleet's expected maximum when the target is Netlify. Without it the script
 * compares against `DATABASE_POOL_MAX x POOL_CHECK_INSTANCES`, which is the right
 * figure for one process and the honest figure for a local server. A deployed
 * serverless target can run more instances than localhost, so set the ceiling
 * explicitly when checking production. `docs/DEPLOYMENT.md` carries the
 * arithmetic.
 *
 * The observer uses `DIRECT_URL` when present, because the pooler can hide the
 * real backend count behind its own sessions. It never prints either URL.
 *
 * One limitation worth stating: behind Supabase's transaction pooler,
 * `pg_stat_activity` shows the pooler's server-side connections, not the client
 * sockets the application opened, because the pooler multiplexes them. The
 * connection delta is therefore a check against provider exhaustion, while the
 * client-side cap is the configured pool plus the absence of failures under the
 * same load. Running the check against the direct connection, as the record in
 * `docs/DEPLOYMENT.md` does once, is what makes the pool cap itself visible.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { databasePoolMax } from "../src/pool.ts";

const ENDPOINT = "/api/v1/health/ready";

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function optionalPositiveInt(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );

  return sorted[index] ?? 0;
}

const baseUrl = (process.env.POOL_CHECK_URL?.trim() || "http://localhost:3000").replace(
  /\/+$/,
  "",
);
const endpoint = `${baseUrl}${ENDPOINT}`;
const requestCount = positiveInt("POOL_CHECK_REQUESTS", 60);
const concurrency = Math.min(positiveInt("POOL_CHECK_CONCURRENCY", 20), requestCount);
const instances = positiveInt("POOL_CHECK_INSTANCES", 1);
const poolMax = databasePoolMax();
const explicitCeiling = optionalPositiveInt("POOL_CHECK_MAX_CONNECTIONS");
const allowedConnections = explicitCeiling ?? poolMax * instances;

const observerUrl =
  process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || null;

if (!observerUrl) {
  console.error(
    "Neither DIRECT_URL nor DATABASE_URL is set, so the check cannot see the database. See .env.example.",
  );
  process.exit(1);
}

const observer = new PrismaClient({
  adapter: new PrismaPg({ connectionString: observerUrl, max: 1 }),
});

async function connectionCount(): Promise<number> {
  const rows = await observer.$queryRaw<Array<{ count: number }>>`
    SELECT count(*)::int AS count
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
  `;

  return rows[0]?.count ?? 0;
}

async function probe(): Promise<number> {
  const startedAt = performance.now();
  const response = await fetch(endpoint, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("status" in body) ||
    body.status !== "ready"
  ) {
    throw new Error("the endpoint answered 200 but did not report ready");
  }

  return performance.now() - startedAt;
}

let baseline = 0;
let peak = 0;

try {
  baseline = await connectionCount();
  peak = baseline;

  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      try {
        peak = Math.max(peak, await connectionCount());
      } catch {
        // A dropped sample is not a failed check. The next one will do.
      }
      await delay(50);
    }
  })();

  let issued = 0;
  const latencies: number[] = [];
  const failures: string[] = [];

  async function worker(): Promise<void> {
    for (;;) {
      const index = issued;
      issued += 1;
      if (index >= requestCount) return;

      try {
        latencies.push(await probe());
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "unknown error");
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  sampling = false;
  await sampler;

  const after = await connectionCount();
  const delta = Math.max(0, peak - baseline);
  const overCeiling = delta > allowedConnections;

  console.log("Pool check");
  console.log(`  endpoint          ${endpoint}`);
  console.log(
    `  requests          ${requestCount} at ${concurrency} concurrent`,
  );
  console.log(
    `  pool              ${poolMax} per instance x ${instances} instance(s) = ${poolMax * instances}`,
  );
  console.log(
    `  ceiling           ${allowedConnections}${explicitCeiling ? " (POOL_CHECK_MAX_CONNECTIONS)" : ""}`,
  );
  console.log(`  connections       baseline ${baseline}, peak ${peak}, delta ${delta}`);
  console.log(`  after requests    ${after}`);
  console.log(
    `  latency           p50 ${Math.round(percentile(latencies, 0.5))}ms, p95 ${Math.round(percentile(latencies, 0.95))}ms`,
  );
  console.log(`  failures          ${failures.length}`);

  for (const failure of failures.slice(0, 5)) {
    console.log(`    - ${failure}`);
  }
  if (failures.length > 5) {
    console.log(`    - and ${failures.length - 5} more`);
  }

  if (overCeiling) {
    console.error(
      `\nFAILED: the pool opened ${delta} connections, above the ${allowedConnections} ceiling.`,
    );
  }
  if (failures.length > 0) {
    console.error("\nFAILED: some requests did not answer ready.");
  }

  process.exitCode = overCeiling || failures.length > 0 ? 1 : 0;
} catch (error) {
  console.error(
    "Pool check could not run:",
    error instanceof Error ? error.message : "unknown error",
  );
  process.exitCode = 1;
} finally {
  await observer.$disconnect();
}
