/**
 * The customer's order, as the tracking and cancellation screens read it.
 *
 * Both screens need the same two things: the order itself, and a way to prove
 * the browser is allowed to see it. Keeping that in one module is what stops the
 * two screens drifting into two different ideas of what "the order" contains, or
 * two copies of the token-then-phone access rule.
 *
 * The credential is still the guest token issued at placement, falling back to
 * the phone number the order was placed with. Neither is an account; see
 * `lib/public/orders.ts` for why that is the accepted trade.
 */

import { readOrderPhone, readOrderToken } from "./checkout-store";

export interface OrderLine {
  readonly name: string;
  readonly unitPriceKobo: string;
  readonly quantity: number;
  readonly lineTotalKobo: string;
  readonly notes: string | null;
}

export interface OrderEventRead {
  readonly id: string;
  readonly status: string;
  readonly label: string;
  readonly at: string;
  readonly reason: string | null;
  readonly note: string | null;
}

export interface OrderRead {
  readonly orderNumber: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly placedAt: string;
  readonly kitchen: { readonly name: string; readonly slug: string; readonly phone: string | null };
  readonly rider: { readonly name: string; readonly phone: string } | null;
  readonly etaMinutes: number | null;
  readonly address: unknown;
  readonly lines: readonly OrderLine[];
  readonly subtotalKobo: string;
  readonly deliveryFeeKobo: string;
  readonly totalKobo: string;
  readonly paymentMethod: "cod" | "transfer" | "card";
  readonly deliveryNotes: string | null;
  readonly timeline: readonly OrderEventRead[];
  readonly canCancel: boolean;
}

export type OrderAccess = { readonly token: string } | { readonly phone: string };

interface SuccessBody<T> {
  readonly ok: true;
  readonly data: T;
}

interface FailureBody {
  readonly ok: false;
  readonly error: { readonly message: string };
}

/** The credential this browser has for this order, if it has one. */
export function readStoredAccess(orderNumber: string): OrderAccess | null {
  const token = readOrderToken(orderNumber);
  if (token) return { token };

  const phone = readOrderPhone(orderNumber);
  if (phone) return { phone };

  return null;
}

function accessQuery(access: OrderAccess): string {
  return "phone" in access ? `?phone=${encodeURIComponent(access.phone)}` : "";
}

function accessHeaders(access: OrderAccess): HeadersInit | undefined {
  return "token" in access ? { Authorization: `Bearer ${access.token}` } : undefined;
}

async function readEnvelope<T>(response: Response, fallback: string): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // A gateway returned HTML, or the connection died mid-body.
  }

  if (!response.ok) {
    const failure = body as FailureBody | null;
    throw new Error(failure?.error?.message ?? fallback);
  }

  const success = body as SuccessBody<T> | null;
  if (!success || success.ok !== true) throw new Error(fallback);

  return success.data;
}

export async function fetchOrder(
  orderNumber: string,
  access: OrderAccess,
  signal?: AbortSignal,
): Promise<OrderRead> {
  const response = await fetch(
    `/api/v1/orders/${encodeURIComponent(orderNumber)}${accessQuery(access)}`,
    { signal, headers: accessHeaders(access) },
  );

  return readEnvelope<OrderRead>(response, "This order could not be loaded.");
}

export interface CancelledOrder {
  readonly orderNumber: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly cancelledAt: string;
}

/**
 * Ask the server to cancel. The reason is a core code, never its label: the
 * route validates against core's own list, so a client cannot invent one.
 *
 * `note` is sent only when it says something, so the recorded event does not
 * carry an empty explanation that looks like an unanswered field.
 */
export async function requestCancellation(input: {
  readonly orderNumber: string;
  readonly access: OrderAccess;
  readonly reason: string;
  readonly note?: string;
}): Promise<CancelledOrder> {
  const response = await fetch(
    `/api/v1/orders/${encodeURIComponent(input.orderNumber)}/cancel`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessHeaders(input.access) ?? {}),
      },
      body: JSON.stringify({
        reason: input.reason,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        ...("phone" in input.access ? { phone: input.access.phone } : {}),
      }),
    },
  );

  return readEnvelope<CancelledOrder>(response, "The order could not be cancelled.");
}
