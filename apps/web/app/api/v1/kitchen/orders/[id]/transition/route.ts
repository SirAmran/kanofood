import { z } from "zod";

import { ORDER_STATUSES, KITCHEN_REJECTION_REASONS } from "@kanofood/core";
import type { KitchenRejectionReason, OrderStatus } from "@kanofood/core";

import { routeId } from "@/lib/api/schema";
import { assertKitchenActive, kitchenRoute } from "@/lib/kitchen/route";
import { transitionKitchenOrder } from "@/lib/kitchen/orders";

/**
 * `POST /api/v1/kitchen/orders/:id/transition` — accept, reject, prepare, ready.
 *
 * `from` is the status the caller believes the order is in, and the update is
 * conditional on it, so two people on the same order get a conflict rather than
 * one silently overwriting the other.
 *
 * A rejection carries a reason *code* and an optional note. The service stores
 * the human label on the event and the code beside it in metadata, so the
 * timeline reads in English and a report can still count by cause.
 */

export const dynamic = "force-dynamic";

const STATUS = z.enum(ORDER_STATUSES as unknown as [OrderStatus, ...OrderStatus[]]);
const REASON = z.enum(KITCHEN_REJECTION_REASONS as unknown as [KitchenRejectionReason, ...KitchenRejectionReason[]]);

const bodySchema = z.object({
  from: STATUS,
  to: STATUS,
  /** Required when rejecting; refused on every other move, in the service. */
  reasonCode: REASON.optional(),
  note: z.string().trim().max(500).optional(),
});

export const POST = kitchenRoute({
  body: bodySchema,
  handler: async ({ body, actor, params, kitchen }) => {
    assertKitchenActive(kitchen.kitchen);
    const id = routeId(params);

    const at = await transitionKitchenOrder({
      orderId: id,
      kitchenId: kitchen.kitchen.id,
      from: body.from,
      to: body.to,
      actor,
      reasonCode: body.reasonCode ?? null,
      note: body.note ?? null,
    });

    return { id, status: body.to, at: at.toISOString() };
  },
});
