import { z } from "zod";

import { switchField } from "@/lib/api/schema";
import { kitchenRoute } from "@/lib/kitchen/route";
import { setOwnKitchenOpen } from "@/lib/kitchen/settings";

/**
 * `POST /api/v1/kitchen/open` — open or close for trading.
 *
 * Deliberately not gated on the kitchen being active: a suspended kitchen still
 * needs to be able to close itself, and the service refuses the opening
 * direction on its own with a message that says why.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ isOpen: switchField() });

export const POST = kitchenRoute({
  body: bodySchema,
  handler: async ({ body, actor, kitchen }) => {
    await setOwnKitchenOpen({
      kitchenId: kitchen.kitchen.id,
      isOpen: body.isOpen,
      actor,
    });
    return { isOpen: body.isOpen };
  },
});
