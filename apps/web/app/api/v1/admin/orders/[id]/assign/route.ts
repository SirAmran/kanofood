import { z } from "zod";

import { staffRoute } from "@/lib/api/route";
import { assignRider } from "@/lib/admin/orders";

/**
 * `POST /api/v1/admin/orders/:id/assign` — put a rider on an order.
 *
 * Its own endpoint rather than a transition with a rider in the body, because it
 * writes two rows: the delivery and the order. A transition that sometimes also
 * creates a delivery is a transition whose failure modes depend on its body.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ riderId: z.uuid() });

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = params.id;
    if (typeof id !== "string" || id === "") {
      throw new Error("The order id segment is missing from the route.");
    }

    await assignRider({ orderId: id, riderId: body.riderId, actor });

    return { id, riderId: body.riderId, status: "RIDER_ASSIGNED" };
  },
});
