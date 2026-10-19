import type { Metadata } from "next";

import { platformPhone } from "@/lib/env";

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

  return <CancelView orderNumber={number.toUpperCase()} platformPhone={platformPhone()} />;
}
