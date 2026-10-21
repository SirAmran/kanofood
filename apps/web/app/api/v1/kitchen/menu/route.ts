import { kobo } from "@/lib/api/http";
import { kitchenRoute } from "@/lib/kitchen/route";
import { loadKitchenMenu } from "@/lib/kitchen/menu";

/**
 * `GET /api/v1/kitchen/menu` — this kitchen's menu, sections and dishes.
 *
 * Inactive sections and unavailable dishes are included. The kitchen screen is
 * where they are switched back on, so hiding them here would leave the only
 * switch that can restore them unreachable.
 */

export const dynamic = "force-dynamic";

export const GET = kitchenRoute({
  handler: async ({ kitchen }) => {
    const categories = await loadKitchenMenu(kitchen.kitchen.id);

    return {
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
        items: category.items.map((item) => ({
          ...item,
          priceKobo: kobo(item.priceKobo),
        })),
      })),
    };
  },
});
