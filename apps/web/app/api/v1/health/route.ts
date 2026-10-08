import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness probe. Confirms the route handler layer is serving.
 * Database connectivity checks arrive with Phase 2, once a provider is chosen.
 */
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "kanofood-web",
    time: new Date().toISOString(),
  });
}
