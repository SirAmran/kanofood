import type { Metadata } from "next";

import { pushVapidPublicKey } from "@/lib/env";
import { loadPlatformContact } from "@/lib/settings/platform";

import { OrderView } from "../../_components/order-view";
import { PushSubscribe } from "../../_components/push-subscribe";

/**
 * Screens 4.10 and 4.11. The order number is the address; the credential is
 * not. See the note at the top of the view for why the token stays in storage
 * and out of the link. `?placed=1` is the confirmation; without it this is
 * tracking.
 *
 * The push control is mounted here rather than in the view because it reads its
 * own credential from this browser's storage and needs no state from the view.
 * It sits under the order: an offer to be told when the food moves only makes
 * sense once somebody is waiting on it.
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
  const orderNumber = number.toUpperCase();
  const contact = await loadPlatformContact();

  return (
    <>
      <OrderView
        orderNumber={orderNumber}
        placed={placed === "1"}
        platformPhone={contact.phone}
      />
      <PushSubscribe orderNumber={orderNumber} vapidPublicKey={pushVapidPublicKey()} />
    </>
  );
}
