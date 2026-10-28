import { staffRoute } from "@/lib/api/route";
import { seedFeaturedDefaults } from "@/lib/admin/featured";

/**
 * `POST /api/v1/admin/featured/defaults` — turn the built-in rail into rows.
 *
 * No body. With any row already present it returns `created: 0`, because a
 * second copy of a set the operator may have edited is not a repair.
 */

export const dynamic = "force-dynamic";

export const POST = staffRoute({
  roles: ["admin"],
  handler: async ({ actor }) => {
    const created = await seedFeaturedDefaults({ actor });
    return { created };
  },
});
