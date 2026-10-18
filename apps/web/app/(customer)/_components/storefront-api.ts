/**
 * The storefront's calls to its own public API, from the browser.
 *
 * One place for the envelope, the error text and the money parsing, so a screen
 * asks for a quote or the kitchen's current menu and gets a typed answer or one
 * thrown Error with a message that can be shown as it is.
 */

interface SuccessBody<T> {
  readonly ok: true;
  readonly data: T;
}

interface FailureBody {
  readonly ok: false;
  readonly error: { readonly message: string };
}

async function readData<T>(response: Response, fallback: string): Promise<T> {
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

function parseKobo(value: unknown): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("The delivery price could not be read.");
  }
  return BigInt(value);
}

export type DeliveryQuote =
  | {
      readonly deliverable: true;
      readonly zoneName: string;
      readonly feeKobo: bigint;
      readonly paymentRequirement: string;
      readonly distanceKm: number | null;
    }
  | {
      readonly deliverable: false;
      readonly reason: "outside_delivery_area" | "unknown_kitchen" | string;
      readonly distanceKm: number | null;
    };

interface QuoteBody {
  readonly deliverable: boolean;
  readonly reason?: string;
  readonly zone?: { readonly slug: string; readonly name: string };
  readonly feeKobo?: string;
  readonly paymentRequirement?: string;
  readonly distanceKm?: number | null;
}

export async function fetchQuote(
  point: { readonly lat: number; readonly lng: number },
  kitchenSlug?: string,
  signal?: AbortSignal,
): Promise<DeliveryQuote> {
  const response = await fetch("/api/v1/public/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      latitude: point.lat,
      longitude: point.lng,
      ...(kitchenSlug ? { kitchenSlug } : {}),
    }),
    signal,
  });

  const data = await readData<QuoteBody>(response, "Delivery could not be priced just now.");

  if (!data.deliverable || !data.zone || !data.feeKobo || !data.paymentRequirement) {
    return {
      deliverable: false,
      reason: data.reason ?? "outside_delivery_area",
      distanceKm: typeof data.distanceKm === "number" ? data.distanceKm : null,
    };
  }

  return {
    deliverable: true,
    zoneName: data.zone.name,
    feeKobo: parseKobo(data.feeKobo),
    paymentRequirement: data.paymentRequirement,
    distanceKm: typeof data.distanceKm === "number" ? data.distanceKm : null,
  };
}

export interface MenuItemStatus {
  readonly name: string;
  readonly priceKobo: string;
  readonly isAvailable: boolean;
}

export interface KitchenAvailability {
  readonly name: string;
  readonly isOpen: boolean;
  readonly items: ReadonlyMap<string, MenuItemStatus>;
}

interface AvailabilityBody {
  readonly kitchen: { readonly name: string; readonly isOpen: boolean };
  readonly menu: readonly {
    readonly items: readonly {
      readonly id: string;
      readonly name: string;
      readonly priceKobo: string;
      readonly isAvailable: boolean;
    }[];
  }[];
}

/**
 * The kitchen the cart is from, as it is right now: open or closed, and which
 * of the cart's dishes can still be ordered.
 *
 * This is the existing kitchen endpoint, not a second one just for the cart. It
 * already returns the whole menu and the order flags, and a verification call
 * that invented a narrower response would be one more thing to keep in step with
 * it. The order route checks everything again; this call exists so a customer
 * sees a closed kitchen on the cart screen instead of at the end of checkout.
 */
export async function fetchAvailability(
  kitchenSlug: string,
  signal?: AbortSignal,
): Promise<KitchenAvailability> {
  const response = await fetch(`/api/v1/public/kitchens/${encodeURIComponent(kitchenSlug)}`, {
    signal,
    headers: { Accept: "application/json" },
  });

  const data = await readData<AvailabilityBody>(response, "This kitchen could not be loaded.");

  const items = new Map<string, MenuItemStatus>();
  for (const section of data.menu) {
    for (const item of section.items) {
      items.set(item.id, { name: item.name, priceKobo: item.priceKobo, isAvailable: item.isAvailable });
    }
  }

  return { name: data.kitchen.name, isOpen: data.kitchen.isOpen, items };
}
