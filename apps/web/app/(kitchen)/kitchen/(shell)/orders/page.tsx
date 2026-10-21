import type { Metadata } from "next";

import { PageHeader, Stack } from "@kanofood/ui";

import { OrdersQueue } from "@/app/(kitchen)/_components/orders-queue";
import { requireKitchen } from "@/lib/kitchen/session";

/**
 * The order queue. Screen 5.3 in docs/UX_SPEC.md.
 *
 * The list itself is a client component because it polls. This page only proves
 * the caller is signed in and attached to a kitchen, and renders the frame.
 */

export const metadata: Metadata = { title: "Orders" };

export const dynamic = "force-dynamic";

export default async function KitchenOrdersPage() {
  const actor = await requireKitchen();

  return (
    <Stack>
      <PageHeader
        title="Orders"
        sub={`${actor.kitchenName}. Oldest first, because the longest wait is the one to cook next.`}
      />
      <OrdersQueue />
    </Stack>
  );
}
