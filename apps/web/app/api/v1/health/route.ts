import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness probe. Confirms the route handler layer is serving.
 *
 * Deliberately does not touch the database: `/api/v1/health/ready` is the
 * readiness probe, and its comment says why the two must stay apart.
 */
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "kanofood-web",
    time: new Date().toISOString(),
  });
}
