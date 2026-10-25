import type { Metadata } from "next";

import { loadPlatformContact } from "@/lib/settings/platform";

import { CancelView } from "../../../_components/cancel-view";

/**
 * Screen 4.12. See the note at the top of the view for why this is a route
 * rather than the sheet the specification draws.
 */

interface PageProps {
  readonly params: Promise<{ number: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { number } = await params;
  return { title: `Cancel order ${number.toUpperCase()}` };
}

export default async function CancelOrderPage({ params }: PageProps) {
  const { number } = await params;
  const contact = await loadPlatformContact();

  return <CancelView orderNumber={number.toUpperCase()} platformPhone={contact.phone} />;
}
