import type { NextRequest } from "next/server";
import type { ZodType } from "zod";

import { prisma } from "@kanofood/db";

import { ApiError } from "../api/http";
import { staffRoute } from "../api/route";
import type { Actor } from "../auth/guard";

/**
 * The kitchen API's one gate.
 *
 * The shared `staffRoute` proves the caller is a signed-in kitchen operator. It
 * does not prove *which* kitchen they operate, and every route below reads or
 * writes rows that must belong to exactly one kitchen. Resolving the membership
 * here means no handler can forget to: by the time a handler runs, it is holding
 * a kitchen id that came from the database, not from the request.
 *
 * A caller with no membership is refused even though their token is valid. That
 * is the state an account lands in after an admin removes them from a kitchen,
 * and it must fail closed rather than expose a kitchen-less scope.
 */

export interface KitchenContext {
  readonly kitchen: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly isActive: boolean;
  };
  readonly membershipRole: "owner" | "staff";
}

export async function resolveKitchenMembership(userId: string): Promise<KitchenContext> {
  const membership = await prisma.kitchenStaff.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      kitchen: { select: { id: true, name: true, slug: true, isActive: true } },
    },
  });

  if (!membership) {
    throw ApiError.forbidden("This account is not attached to a kitchen.");
  }

  return { kitchen: membership.kitchen, membershipRole: membership.role };
}

/**
 * Refuse a write when the kitchen has been suspended.
 *
 * A suspended kitchen can still sign in and read, because an operator needs to
 * see why nothing is arriving. Every path that would change something calls
 * this first, so suspension means "not taking orders" rather than "locked out
 * with no explanation".
 */
export function assertKitchenActive(kitchen: KitchenContext["kitchen"]): void {
  if (!kitchen.isActive) {
    throw ApiError.conflict(
      "This kitchen is suspended. Ask the platform to reactivate it before making changes.",
    );
  }
}

export interface KitchenRouteConfig<TBody, TQuery, TParams> {
  readonly body?: ZodType<TBody>;
  readonly query?: ZodType<TQuery>;
  readonly handler: (input: {
    req: NextRequest;
    body: TBody;
    query: TQuery;
    actor: Actor;
    params: TParams;
    kitchen: KitchenContext;
  }) => Promise<unknown>;
}

/**
 * A route only a signed-in kitchen operator may call, with its kitchen resolved.
 *
 * Same pipeline as every other staff route - authenticate, authorise, validate,
 * execute - with the membership lookup slotted in between authorisation and
 * validation, so an invalid body costs one query rather than a schema pass on a
 * caller who has no kitchen at all.
 */
export function kitchenRoute<
  TBody,
  TQuery = Record<string, never>,
  TParams = Record<string, string | string[]>,
>(config: KitchenRouteConfig<TBody, TQuery, TParams>) {
  return staffRoute<TBody, TQuery, TParams>({
    roles: ["kitchen_staff"],
    body: config.body,
    query: config.query,
    handler: async ({ req, body, query, actor, params }) => {
      const kitchen = await resolveKitchenMembership(actor.userId);
      return config.handler({ req, body, query, actor, params, kitchen });
    },
  });
}
