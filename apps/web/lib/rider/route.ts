import type { NextRequest } from "next/server";
import type { ZodType } from "zod";

import { prisma } from "@kanofood/db";

import { ApiError } from "../api/http";
import { staffRoute } from "../api/route";
import type { Actor } from "../auth/guard";

/**
 * The rider API's one gate.
 *
 * The shared `staffRoute` proves the caller is a signed-in rider. It does not
 * prove *which rider row* is theirs, and every route below reads or writes rows
 * that must belong to exactly one rider. Resolving the row here means no handler
 * can forget to: by the time a handler runs, it is holding a rider id that came
 * from the database, not from the request.
 *
 * This is the security property the whole rider interface rests on. A rider must
 * not be able to read another rider's deliveries, or mark somebody else's order
 * as picked up, even by guessing id.
 */

export interface RiderContext {
  readonly rider: {
    readonly id: string;
    readonly name: string;
    readonly phone: string;
    readonly isActive: boolean;
  };
}

export async function resolveRider(userId: string): Promise<RiderContext> {
  const rider = await prisma.rider.findUnique({
    where: { userId },
    select: { id: true, name: true, phone: true, isActive: true },
  });

  if (!rider) {
    throw ApiError.forbidden("This account is not attached to a rider profile.");
  }

  return { rider };
}

/**
 * Refuse a write when the rider has been deactivated.
 *
 * Like the kitchen guard: a deactivated rider can still read what they were
 * carrying, because money and food they are physically holding do not vanish
 * with a flag, but nothing new can be recorded against them.
 */
export function assertRiderActive(rider: RiderContext["rider"]): void {
  if (!rider.isActive) {
    throw ApiError.conflict(
      "This rider account is deactivated. Ask the platform to reactivate it before recording anything.",
    );
  }
}

export interface RiderRouteConfig<TBody, TQuery, TParams> {
  readonly body?: ZodType<TBody>;
  readonly query?: ZodType<TQuery>;
  readonly handler: (input: {
    req: NextRequest;
    body: TBody;
    query: TQuery;
    actor: Actor;
    params: TParams;
    rider: RiderContext;
  }) => Promise<unknown>;
}

/** A route only a signed-in rider may call, with their rider row resolved. */
export function riderRoute<
  TBody,
  TQuery = Record<string, never>,
  TParams = Record<string, string | string[]>,
>(config: RiderRouteConfig<TBody, TQuery, TParams>) {
  return staffRoute<TBody, TQuery, TParams>({
    roles: ["rider"],
    body: config.body,
    query: config.query,
    handler: async ({ req, body, query, actor, params }) => {
      const rider = await resolveRider(actor.userId);
      return config.handler({ req, body, query, actor, params, rider });
    },
  });
}
