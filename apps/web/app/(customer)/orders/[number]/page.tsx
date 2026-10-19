import type { Metadata } from "next";

import { platformPhone } from "@/lib/env";

import { OrderView } from "../../_components/order-view";

/**
 * Screens 4.10 and 4.11. The order number is the address; the credential is
 * not. See the note at the top of the view for why the token stays in storage
 * and out of the link. `?placed=1` is the confirmation; without it this is
 * tracking.
 */

interface PageProps {
  readonly params: Promise<{ number: string }>;
  readonly searchParams: Promise<{ placed?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { number } = await params;
  return { title: `Order ${number.toUpperCase()}` };
}

export default async function OrderPage({ params, searchParams }: PageProps) {
  const [{ number }, { placed }] = await Promise.all([params, searchParams]);

  return (
    <OrderView
      orderNumber={number.toUpperCase()}
      placed={placed === "1"}
      platformPhone={platformPhone()}
    />
  );
}
