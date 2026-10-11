import { z } from "zod";

import { staffRoute } from "@/lib/api/route";
import { transitionOrder } from "@/lib/admin/orders";
import { ORDER_STATUSES } from "@kanofood/core";
import type { OrderStatus } from "@kanofood/core";

/**
 * `POST /api/v1/admin/orders/:id/transition` — move one order.
 *
 * ARCHITECTURE section 6 puts the admin surface under `/api/v1/admin`, and the
 * admin screens post to it rather than calling the service directly. That is on
 * purpose even though both run in the same process: the write path is the thing
 * that must be right, and giving it one guarded entrance with one response shape
 * means the guard is exercised by every admin action rather than only by the
 * ones a later mobile client happens to use.
 *
 * `from` is required. It is the status the caller believes the order is in, and
 * the update is conditional on it, so an operator with a stale page gets a
 * conflict instead of overwriting a colleague.
 */

export const dynamic = "force-dynamic";

const STATUS = z.enum(ORDER_STATUSES as unknown as [OrderStatus, ...OrderStatus[]]);

const bodySchema = z.object({
  from: STATUS,
  to: STATUS,
  /** Stored on the event. The domain requires one for two of the ends. */
  reason: z.string().trim().max(500).optional(),
  /** Who was telephoned, for the confirmation record PRODUCT_SPEC 9 requires. */
  contactNote: z.string().trim().max(500).optional(),
});

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = params.id;
    if (typeof id !== "string" || id === "") {
      throw new Error("The order id segment is missing from the route.");
    }

    const at = await transitionOrder({
      orderId: id,
      from: body.from,
      to: body.to,
      actor,
      reason: body.reason ?? null,
      metadata: body.contactNote ? { contactNote: body.contactNote } : null,
    });

    return { id, status: body.to, at: at.toISOString() };
  },
});
