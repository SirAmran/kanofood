import { CANCELLATION_REASONS, ORDER_STATUS_LABELS } from "@kanofood/core";
import { z } from "zod";

import { ApiError, bearerToken } from "@/lib/api/http";
import { publicRoute } from "@/lib/api/route";
import { phoneField, routeId } from "@/lib/api/schema";
import { cancelOrder, looksLikeOrderNumber } from "@/lib/public/orders";

/**
 * `POST /api/v1/orders/:number/cancel` — the customer cancels their own order.
 *
 * Access is the same two ways as reading: the guest token, or the order number
 * with the phone it was placed with. A write with nothing but a phone number is
 * the weaker half of that pair, and it is accepted because the customer holding
 * the receipt is the person the platform wants to be able to cancel. The order
 * number is not guessable in practice and it has to match the same customer's
 * phone; see `assertOrderAccess` for the full reasoning.
 *
 * **The reason is required, and that is not a courtesy.** Core's
 * `requiresReason` is true for `CUSTOMER_CANCELLED`, the same rule the admin's
 * transitions obey, so a cancellation without a reason is refused by the domain
 * before it reaches the database. Offering a fixed list rather than a free text
 * box is what makes the reasons countable later.
 *
 * Cancelling after a rider is assigned is refused by the transition table, not
 * by this file. Business rule 5 leaves that decision to an admin.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reason: z.enum(CANCELLATION_REASONS),
  // The credential may arrive here or on the Authorization header. A form POST
  // from a server-rendered page has the header; a client that only holds a URL
  // has the body.
  token: z.string().trim().max(4096).optional(),
  phone: phoneField().optional(),
});

export const POST = publicRoute<z.infer<typeof bodySchema>, Record<string, never>, { number: string }>({
  body: bodySchema,
  handler: async ({ req, body, params }) => {
    const orderNumber = routeId(params, "number").toUpperCase();

    if (!looksLikeOrderNumber(orderNumber)) {
      throw ApiError.notFound("That order is not on KanoFood.");
    }

    const result = await cancelOrder({
      orderNumber,
      reason: body.reason,
      access: {
        token: bearerToken(req) ?? body.token ?? null,
        phone: body.phone ?? null,
      },
    });

    return {
      orderNumber,
      status: result.status,
      statusLabel: ORDER_STATUS_LABELS[result.status],
      cancelledAt: result.at,
    };
  },
});
