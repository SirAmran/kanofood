import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";

import { type Actor, requireActor } from "../auth/guard";
import type { StaffRole } from "../auth/tokens";
import { ApiError, failure, ok } from "./http";

/**
 * The one pipeline every handler runs, in one place.
 *
 * The order is fixed and it matters: authenticate, authorise, validate, then
 * execute. Validation happens before domain code and before any query, so
 * malformed input never reaches the database. Failures anywhere become the same
 * response shape, so no handler has to remember to catch its own errors and no
 * unexpected exception can escape as a stack trace.
 */

async function readBody(req: NextRequest): Promise<unknown> {  const text = await req.text();
  if (text.trim() === "") return {};

  try {
    return JSON.parse(text);
  } catch {
    throw ApiError.badRequest("The request body is not valid JSON.");
  }
}

/** Field-level detail, so a form can highlight the offending input. */
function describe(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }) {
  return {
    issues: error.issues.map((issue) => ({
      field: issue.path.map(String).join(".") || "(body)",
      message: issue.message,
    })),
  };
}

function parseOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw ApiError.badRequest("Check the highlighted fields and try again.", describe(result.error));
  }
  return result.data;
}

/**
 * The caller's address, for the session record.
 *
 * `x-forwarded-for` is a list and the client is the first entry. This is written
 * to a column an admin can read while investigating a session and is never used
 * to make a decision: a header the caller controls must not be able to authorise
 * anything, and reading it here rather than in an authorisation path is the
 * point of keeping the two apart.
 */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip");
}

/**
 * A handler may return plain data, which is wrapped in the success envelope, or
 * a `NextResponse` it built itself, which is passed through. Sign-in needs the
 * second: it sets cookies on the response.
 */
function respond(result: unknown): NextResponse {
  if (result instanceof NextResponse) return result;
  return ok(result);
}

export interface PublicRouteConfig<TBody> {
  /** Omitted when the route takes no body, such as a GET. */
  readonly body?: ZodType<TBody>;
  readonly handler: (input: { req: NextRequest; body: TBody }) => Promise<unknown>;
}

/** A route anyone may call. It still validates before touching domain code. */
export function publicRoute<TBody>(config: PublicRouteConfig<TBody>) {
  return async function route(req: NextRequest): Promise<NextResponse> {
    try {
      const body = config.body ? parseOrThrow(config.body, await readBody(req)) : ({} as TBody);
      return respond(await config.handler({ req, body }));
    } catch (error) {
      return failure(error);
    }
  };
}

export interface StaffRouteConfig<TBody> {
  /** Omitted means any signed-in staff member. */
  readonly roles?: readonly StaffRole[];
  readonly body?: ZodType<TBody>;
  readonly handler: (input: { req: NextRequest; body: TBody; actor: Actor }) => Promise<unknown>;
}

/**
 * A route only a signed-in staff member may call, optionally restricted to
 * roles. The authorisation check runs before the body is even parsed.
 */
export function staffRoute<TBody>(config: StaffRouteConfig<TBody>) {
  return async function route(req: NextRequest): Promise<NextResponse> {
    try {
      const actor = await requireActor(req, config.roles);
      const body = config.body ? parseOrThrow(config.body, await readBody(req)) : ({} as TBody);
      return respond(await config.handler({ req, body, actor }));
    } catch (error) {
      return failure(error);
    }
  };
}
