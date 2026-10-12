import { routeId } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { reconcilePayment } from "@/lib/admin/cash";

/**
 * `POST /api/v1/admin/payments/:id/reconcile` — agree that the money expected
 * against an order is the money received.
 *
 * Reconciliation is per payment and per order, which is what makes it different
 * from receiving a rider's float. Receiving says "the cash is in the office";
 * this says "and it is the right cash, against the right order".
 *
 * There is no un-reconcile. Undoing it would need a reason and a compensating
 * record, and neither exists yet. Recorded with the other gaps.
 */

export const dynamic = "force-dynamic";

export const POST = staffRoute({
  roles: ["admin"],
  handler: async ({ actor, params }) => {
    const id = routeId(params);
    await reconcilePayment({ paymentId: id, actor });
    return { id, status: "reconciled" };
  },
});
