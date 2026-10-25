import type { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@kanofood/db";

import { ApiError, bearerToken } from "@/lib/api/http";
import { publicRoute } from "@/lib/api/route";
import { getActor } from "@/lib/auth/guard";
import { verifyOrderToken } from "@/lib/auth/tokens";

/**
 * `POST /api/v1/notifications/subscriptions` — remember this browser, so a push
 * can find it later.
 * `DELETE /api/v1/notifications/subscriptions` — forget it again.
 *
 * **Two kinds of caller, one row shape.** A staff member is proved by the
 * session cookie; a guest customer is proved by the same order token the tracking
 * page uses. The row is identical either way — one endpoint, one owner — so a
 * second route would be the same upsert written twice. This is a `publicRoute`
 * for that reason, and the handler does the authorising itself: there is no
 * middleware that can say "staff, or the holder of this order token", and
 * pretending otherwise would hide the check from the only place that can make it.
 *
 * **Exactly one owner, never both.** The database CHECK enforces it, so the route
 * must too. Writing both would either fail at the constraint or, worse, leave a
 * row that says two people share a device and quietly sends one person's order
 * updates to another's phone.
 *
 * The endpoint is a capability URL: whoever holds it can send to that browser.
 * It is never logged and never returned. The key material is the client's, and
 * storing it is the whole point of the table.
 */

export const dynamic = "force-dynamic";

/** Base64url, which is how the Push API hands both keys over. */
const keyField = z
  .string()
  .trim()
  .min(16, "The subscription key is too short to be a push key.")
  .max(255, "The subscription key is too long to be a push key.")
  .refine((value) => /^[A-Za-z0-9_-]+$/.test(value), {
    message: "A push key must be base64url.",
  });

const endpointField = z
  .string()
  .trim()
  .max(2048, "That push endpoint is longer than any push service issues.")
  .refine(
    (value) => {
      try {
        // Push endpoints are always HTTPS. A plain-HTTP one is either a broken
        // client or somebody probing, and either way it is not storable.
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "That is not a push endpoint." },
  );

const subscribeBody = z.object({
  endpoint: endpointField,
  keys: z.object({ p256dh: keyField, auth: keyField }),
});

const unsubscribeBody = z.object({ endpoint: endpointField });

/** Exactly one of the two, as the database requires. */
type Owner = { readonly userId: string } | { readonly customerId: string };

/**
 * Who this browser belongs to.
 *
 * The session cookie is tried first: a signed-in staff member is a stronger
 * credential than an order link, and a staff member who also happens to be
 * looking at an order should be recorded as themselves rather than as that
 * order's customer.
 *
 * A guest has no session, so the fallback is the token issued at placement,
 * checked against the order it names and then narrowed to that order's customer.
 * The phone-number route the tracking page also accepts is deliberately not
 * offered here: it is a weaker credential, and it should not be able to attach a
 * device to an account.
 */
async function resolveOwner(req: NextRequest, token: string | null): Promise<Owner> {
  const actor = await getActor(req);
  if (actor) return { userId: actor.userId };

  if (!token) throw ApiError.unauthorised("Sign in, or open the order you are tracking.");

  const claims = await verifyOrderToken(token);
  if (!claims) throw ApiError.unauthorised("That tracking link is no longer valid.");

  const order = await prisma.order.findUnique({
    where: { orderNumber: claims.orderNumber },
    select: { customerId: true },
  });
  // A token for an order that has gone is not a way in to anything.
  if (!order) throw ApiError.unauthorised("That tracking link is no longer valid.");

  return { customerId: order.customerId };
}

/** The owner columns, with the other one explicitly null so a re-subscribe moves it. */
function ownerColumns(owner: Owner): { userId: string | null; customerId: string | null } {
  return "userId" in owner
    ? { userId: owner.userId, customerId: null }
    : { userId: null, customerId: owner.customerId };
}

/** Where the endpoint points, for a log line. The endpoint itself is a credential. */
function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "unknown";
  }
}

export const POST = publicRoute<z.infer<typeof subscribeBody>>({
  body: subscribeBody,
  handler: async ({ req, body }) => {
    const owner = await resolveOwner(
      req,
      bearerToken(req) ?? req.nextUrl.searchParams.get("token"),
    );
    const columns = ownerColumns(owner);

    /**
     * Upsert by endpoint, because the browser issues it and subscribing twice
     * from the same browser is the same endpoint and the same keys.
     *
     * The update moves the owner as well as refreshing the keys. A phone that
     * places a second order is one person, and the newer order is the one they
     * are watching; leaving the row pointing at the previous customer would send
     * the next update to a phone that is no longer waiting for it. It also clears
     * `disabledAt`, because a subscription that has come back is not disabled.
     */
    const row = await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: userAgent(req),
        ...columns,
      },
      update: {
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: userAgent(req),
        disabledAt: null,
        ...columns,
      },
      select: { id: true },
    });

    console.info(`[push] subscription ${row.id} registered for ${endpointHost(body.endpoint)}`);
    return { subscribed: true };
  },
});

export const DELETE = publicRoute<z.infer<typeof unsubscribeBody>>({
  body: unsubscribeBody,
  handler: async ({ req, body }) => {
    const owner = await resolveOwner(
      req,
      bearerToken(req) ?? req.nextUrl.searchParams.get("token"),
    );

    /**
     * Scoped by owner as well as endpoint, so a caller cannot delete somebody
     * else's subscription by sending an endpoint they should not have. A wrong
     * owner matches no row and the request is a no-op, which is the same answer
     * as "already gone" and tells a prober nothing about whether the endpoint
     * exists.
     */
    const removed = await prisma.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint, ...owner },
    });

    return { removed: removed.count };
  },
});

/** A device, as much as the column needs to say. Never parsed, never trusted. */
function userAgent(req: Request): string | null {
  const value = req.headers.get("user-agent")?.trim();
  return value ? value.slice(0, 300) : null;
}
