import { z } from "zod";

import {
  DELIVERY_FAILURE_REASONS,
  ORDER_STATUSES,
} from "@kanofood/core";
import type { DeliveryFailureReason, OrderStatus } from "@kanofood/core";

import { routeId } from "@/lib/api/schema";
import { assertRiderActive, riderRoute } from "@/lib/rider/route";
import { transitionRiderDelivery } from "@/lib/rider/deliveries";

/**
 * `POST /api/v1/rider/deliveries/:id/transition` — picked up, out for delivery,
 * delivered, or failed.
 *
 * `from` is the status the caller believes the order is in, and the update is
 * conditional on it, so two taps on the same button get a conflict rather than
 * one silently overwriting the other.
 *
 * A failure carries a reason *code* and an optional note. The service stores the
 * human label on the event and in the delivery row, with the code beside it in
 * metadata, so the admin's failure queue reads in English and a report can still
 * count by cause.
 */

export const dynamic = "force-dynamic";

const STATUS = z.enum(ORDER_STATUSES as unknown as [OrderStatus, ...OrderStatus[]]);
const REASON = z.enum(
  DELIVERY_FAILURE_REASONS as unknown as [DeliveryFailureReason, ...DeliveryFailureReason[]],
);

const bodySchema = z.object({
  from: STATUS,
  to: STATUS,
  /** Required when reporting a failure; refused on every other move, in the service. */
  reasonCode: REASON.optional(),
  note: z.string().trim().max(500).optional(),
});

export const POST = riderRoute({
  body: bodySchema,
  handler: async ({ body, actor, params, rider }) => {
    assertRiderActive(rider.rider);
    const orderId = routeId(params);

    const at = await transitionRiderDelivery({
      orderId,
      riderId: rider.rider.id,
      from: body.from,
      to: body.to,
      actor,
      reasonCode: body.reasonCode ?? null,
      note: body.note ?? null,
    });

    return { id: orderId, status: body.to, at: at.toISOString() };
  },
});
