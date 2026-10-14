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

async function readBody(req: NextRequest): Promise<unknown> {
  const text = await req.text();
  if (text.trim() === "") return {};

  try {
    return JSON.parse(text);
  } catch {
    throw ApiError.badRequest("The request body is not valid JSON.");
  }
}

/**
 * The query string, flattened to a plain object.
 *
 * A repeated key collapses to its last value. That is the right answer for every
 * parameter this API takes, all of which are scalars, and it is worth being
 * explicit about because the alternative reading, "the caller asked for both",
 * is not something any handler here could act on. A `?sort=a&sort=b` is a client
 * bug and it resolves rather than failing, which is what a filter that is merely
 * redundant should do.
 */
function readQuery(req: NextRequest): Record<string, string> {
  return Object.fromEntries(req.nextUrl.searchParams.entries());
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

/**
 * The dynamic segments Next resolves from the file path.
 *
 * `params` is a promise in this version of Next, so it is awaited before the
 * handler runs. It is passed alongside the body because a route handler should
 * not have to re-parse its own URL to find out which row it was pointed at: the
 * framework already knows, and parsing the path by hand is a way to get it
 * subtly wrong on a trailing slash.
 */
export type RouteParams<TParams> = { readonly params: Promise<TParams> };

type AnyParams = Record<string, string | string[]>;

export interface PublicRouteConfig<TBody, TQuery, TParams = AnyParams> {
  /** Omitted when the route takes no body, such as a GET. */
  readonly body?: ZodType<TBody>;
  /**
   * A GET's parameters. Validated by the same pipeline as a body and for the
   * same reason: a query string is caller-controlled input, and a browse screen
   * that passes a latitude through it must be checked before a query is built
   * from it, not after. A route with neither passes `{}` and a schema of `{}`.
   */
  readonly query?: ZodType<TQuery>;
  readonly handler: (input: {
    req: NextRequest;
    body: TBody;
    query: TQuery;
    params: TParams;
  }) => Promise<unknown>;
}

export interface StaffRouteConfig<TBody, TQuery, TParams = AnyParams> {
  /** Omitted means any signed-in staff member. */
  readonly roles?: readonly StaffRole[];
  readonly body?: ZodType<TBody>;
  /** See `PublicRouteConfig.query`. Admin list screens filter through it too. */
  readonly query?: ZodType<TQuery>;
  readonly handler: (input: {
    req: NextRequest;
    body: TBody;
    query: TQuery;
    actor: Actor;
    params: TParams;
  }) => Promise<unknown>;
}

/** A route anyone may call. It still validates before touching domain code. */
export function publicRoute<TBody, TQuery = Record<string, never>, TParams = AnyParams>(
  config: PublicRouteConfig<TBody, TQuery, TParams>,
) {
  return async function route(
    req: NextRequest,
    context: RouteParams<TParams>,
  ): Promise<NextResponse> {
    try {
      const params = await context.params;
      const body = config.body ? parseOrThrow(config.body, await readBody(req)) : ({} as TBody);
      const query = config.query
        ? parseOrThrow(config.query, readQuery(req))
        : ({} as TQuery);
      return respond(await config.handler({ req, body, query, params }));
    } catch (error) {
      return failure(error);
    }
  };
}

/**
 * A route only a signed-in staff member may call, optionally restricted to
 * roles. The authorisation check runs before the body is even parsed.
 */
export function staffRoute<TBody, TQuery = Record<string, never>, TParams = AnyParams>(
  config: StaffRouteConfig<TBody, TQuery, TParams>,
) {
  return async function route(
    req: NextRequest,
    context: RouteParams<TParams>,
  ): Promise<NextResponse> {
    try {
      // Authenticate and authorise first. Nothing below this line runs for a
      // caller who is not allowed to be here.
      const actor = await requireActor(req, config.roles);
      const params = await context.params;
      const body = config.body ? parseOrThrow(config.body, await readBody(req)) : ({} as TBody);
      const query = config.query
        ? parseOrThrow(config.query, readQuery(req))
        : ({} as TQuery);
      return respond(await config.handler({ req, body, query, actor, params }));
    } catch (error) {
      return failure(error);
    }
  };
}
