import { z } from "zod";

import { kobo } from "@/lib/api/http";
import { integerField } from "@/lib/api/schema";
import { kitchenRoute } from "@/lib/kitchen/route";
import { KITCHEN_PAGE_SIZE, isKitchenTab, listKitchenOrders, type KitchenTab } from "@/lib/kitchen/orders";

/**
 * `GET /api/v1/kitchen/orders?tab=new` — this kitchen's queue, with tab counts.
 *
 * The counts are over the whole queue rather than the open tab, so the strip
 * can say what each tab holds. The list itself is oldest first: the order that
 * has been waiting longest is the one that needs picking up.
 */

export const dynamic = "force-dynamic";

const TAB_KEYS: readonly KitchenTab[] = ["new", "preparing", "ready", "completed"];

const querySchema = z.object({
  tab: z
    .string()
    .refine(isKitchenTab, { message: "That is not a queue tab." })
    .transform((value) => value as KitchenTab)
    .optional(),
  page: integerField("Page", { min: 1, max: 10_000 }).optional(),
});

export const GET = kitchenRoute({
  query: querySchema,
  handler: async ({ query, kitchen }) => {
    const data = await listKitchenOrders({
      kitchenId: kitchen.kitchen.id,
      tab: query.tab ?? "new",
      page: query.page,
    });

    return {
      tab: data.tab,
      tabs: TAB_KEYS,
      counts: data.counts,
      total: data.total,
      pageSize: KITCHEN_PAGE_SIZE,
      rows: data.rows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        totalKobo: kobo(row.totalKobo),
        placedAt: row.placedAt.toISOString(),
        customerName: row.customerName,
        deliveryArea: row.deliveryArea,
        items: row.items,
      })),
    };
  },
});
