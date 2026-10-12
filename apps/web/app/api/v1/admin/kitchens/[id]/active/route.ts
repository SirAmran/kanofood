import { z } from "zod";

import { routeId, switchField } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { setKitchenActive } from "@/lib/admin/kitchens";

/**
 * `POST /api/v1/admin/kitchens/:id/active` — suspend or reinstate a kitchen.
 *
 * Suspending also closes it, in the service. A kitchen that is suspended and
 * still marked open is a kitchen that looks available on any screen that reads
 * only one of the two columns.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ isActive: switchField() });

export const POST = staffRoute({
  roles: ["admin"],
  body: bodySchema,
  handler: async ({ body, actor, params }) => {
    const id = routeId(params);
    await setKitchenActive({ kitchenId: id, isActive: body.isActive, actor });
    return { id, isActive: body.isActive };
  },
});
