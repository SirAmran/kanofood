import { NextResponse } from "next/server";

/**
 * The one response shape every route returns.
 *
 * A caller can tell success from failure without inspecting the status code,
 * and a failure always carries a stable machine-readable `code` alongside a
 * message written for a human. Nothing else is added: no stack traces, no
 * driver errors, no internal identifiers.
 */

export type ApiErrorCode =
  | "bad_request"
  | "unauthorised"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal";

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorised: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError("bad_request", message, details);
  }
  static unauthorised(message = "Sign in to continue."): ApiError {
    return new ApiError("unauthorised", message);
  }
  static forbidden(message = "This account cannot do that."): ApiError {
    return new ApiError("forbidden", message);
  }
  static notFound(message = "Not found."): ApiError {
    return new ApiError("not_found", message);
  }
  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError("conflict", message, details);
  }
  static internal(message = "Something went wrong on our side."): ApiError {
    return new ApiError("internal", message);
  }
}

export interface ApiSuccessBody<T> {
  readonly ok: true;
  readonly data: T;
}

export interface ApiFailureBody {
  readonly ok: false;
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    /** Present on validation failures: which field, and why. */
    readonly details?: unknown;
  };
}

export type ApiBody<T> = ApiSuccessBody<T> | ApiFailureBody;

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccessBody<T>> {
  return NextResponse.json<ApiSuccessBody<T>>({ ok: true, data }, init);
}

export function failure(error: unknown): NextResponse<ApiFailureBody> {
  if (error instanceof ApiError) {
    return NextResponse.json<ApiFailureBody>(
      error.details === undefined
        ? { ok: false, error: { code: error.code, message: error.message } }
        : { ok: false, error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }

  /**
   * Anything unrecognised becomes an opaque 500. The real error is logged
   * server side, where it can be read, and never returned, because a driver
   * message or a stack trace is reconnaissance and sometimes a credential.
   */
  console.error("[api] unhandled error", error);
  return NextResponse.json<ApiFailureBody>(
    { ok: false, error: { code: "internal", message: "Something went wrong on our side." } },
    { status: 500 },
  );
}

/**
 * Money crosses the wire as a decimal string, never a number.
 *
 * Every amount in this system is integer kobo held as a BigInt. JSON has no
 * BigInt, and Number loses precision past 2^53, so a serializer that quietly
 * converted would be a money bug waiting for a large enough order. Kobo as a
 * string is exact and unambiguous, and the client formats it for display.
 */
export function kobo(value: bigint): string {
  return value.toString();
}

/**
 * The credential on an `Authorization` header, if there is one.
 *
 * The scheme test is case-insensitive because RFC 7235 says it is, and a client
 * that sends `bearer` is not making a mistake. Anything that is not a
 * well-formed two-part header returns `null` rather than throwing: a malformed
 * header is an unauthenticated caller, which is an answer, not an error.
 *
 * Its own function rather than inline in two route files, because the guest
 * order token is read on both the tracking and the cancellation route and two
 * copies of a credential check are two places to get it subtly wrong.
 */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;

  const [scheme, ...rest] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;

  const value = rest.join(" ").trim();
  return value === "" ? null : value;
}
