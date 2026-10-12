import { z } from "zod";

import { dateField } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { createSettlement } from "@/lib/admin/settlements";
import { lagosDayFromInput } from "@/lib/admin/status";
import { ApiError } from "@/lib/api/http";

/**
 * `POST /api/v1/admin/settlements` — record what a kitchen is owed.
 *
 * The period is given as two dates and anchored to Lagos midnight, end
 * exclusive. A bare `YYYY-MM-DD` read as UTC midnight would start the period at
 * 1am in Kano and mis-attribute the last hour of the previous night.
 *
 * The three figures are computed by the service from `computeSettlement` in core
 * and are deliberately not accepted from the caller. A settlement whose numbers
 * arrived in a request body is a settlement anybody can write.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kitchenId: z.string().uuid("Pick a kitchen."),
  from: dateField("The start of the period"),
  to: dateField("The end of the period"),
  model: z.enum(["model_a", "model_b"]).optional(),
});

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor }) => {
    const start = lagosDayFromInput(body.from, "start");
    // `end` is the last millisecond of the closing day, and the period is
    // half-open at the top, so a settlement covering one day covers that whole
    // day and the delivery that lands at 23:59 belongs to it.
    const end = lagosDayFromInput(body.to, "end");

    if (!start || !end) {
      throw ApiError.badRequest("One of those dates is not a real date.");
    }

    const id = await createSettlement({
      kitchenId: body.kitchenId,
      periodStart: start,
      // `end` is 23:59:59.999 of the closing day; the period bound is the instant
      // after it, so the closing day is included and the next is not.
      periodEnd: new Date(end.getTime() + 1),
      model: body.model,
      actor,
    });

    return { id };
  },
});
