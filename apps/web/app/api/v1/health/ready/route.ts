import { NextResponse } from "next/server";

import { prisma } from "@kanofood/db";

/**
 * `GET /api/v1/health/ready` — can this instance serve a request that needs data?
 *
 * Separate from the liveness probe beside it. Liveness answers "is the route
 * handler layer up", which is the question a host asks before blaming the
 * process; readiness asks "can it reach the database", which is the question a
 * deploy, an uptime monitor, and the Phase 10 pool check all need answered. One
 * endpoint cannot be both: a liveness probe that fails on a database blip asks
 * the platform to restart healthy instances, and a restart opens new pools while
 * the old connections are still draining.
 *
 * A 503 is the correct failure here, and the body says which check failed and
 * nothing else. The error itself is not returned: a connection error can carry a
 * host name, and a health endpoint is public. The platform's own logs keep the
 * detail.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ready",
      service: "kanofood-web",
      checks: {
        database: {
          status: "ok",
          latencyMs: Math.round(performance.now() - startedAt),
        },
      },
      time: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Readiness check failed:",
      error instanceof Error ? error.name : "unknown error",
    );

    return NextResponse.json(
      {
        status: "unready",
        service: "kanofood-web",
        checks: { database: { status: "failed" } },
        time: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
