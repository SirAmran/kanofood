import { z } from "zod";

import { staffRoute } from "@/lib/api/route";
import { reconcilePayments } from "@/lib/admin/cash";

/**
 * `POST /api/v1/admin/payments/reconcile` — reconcile a batch.
 *
 * The list on screen 7.8 is worked through in one sitting, and one row at a time
 * is the difference between a five-minute job and a twenty-minute one. The
 * service caps the batch at 200 and only touches payments that are actually
 * `collected`, so a stale page cannot reconcile something that has moved on.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Pick at least one payment.").max(200),
});

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor }) => {
    const count = await reconcilePayments({ paymentIds: body.ids, actor });
    return { count };
  },
});
