/**
 * The customer's own data, kept in their browser.
 *
 * The address, the name and phone they last used, and the token for each order
 * they placed. None of it is a credential for anything but that one order, and
 * all of it is lost if storage is cleared, which is why the order screen also
 * accepts the phone number as a way back in.
 *
 * Nothing here is read on the server. The location is a cookie precisely because
 * the server needs it; these values are only ever read by the screen that
 * collected them.
 */

export interface DeliveryAddress {
  readonly label: string;
  readonly addressText: string;
  readonly landmark: string | null;
  readonly instructions: string | null;
  readonly lat: number;
  readonly lng: number;
}

export interface CustomerContact {
  readonly name: string;
  readonly phone: string;
}

const ADDRESS_KEY = "kf_address_v1";
const CUSTOMER_KEY = "kf_customer_v1";
const ORDER_TOKENS_KEY = "kf_order_tokens_v1";
const ORDER_PHONES_KEY = "kf_order_phones_v1";

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function readMap(key: string): Record<string, string> {
  const value = readJson(key);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};

  const map: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (typeof entryValue === "string") map[entryKey] = entryValue;
  }
  return map;
}

function writeMap(key: string, map: Record<string, string>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // A full or blocked storage must not stop an order being placed.
  }
}

/** The address most recently confirmed on screen 4.8. */
export function readAddress(): DeliveryAddress | null {
  const value = readJson(ADDRESS_KEY);
  if (typeof value !== "object" || value === null) return null;

  const address = value as Record<string, unknown>;
  if (typeof address.addressText !== "string" || address.addressText.trim() === "") return null;
  if (typeof address.lat !== "number" || !Number.isFinite(address.lat)) return null;
  if (typeof address.lng !== "number" || !Number.isFinite(address.lng)) return null;

  return {
    label: typeof address.label === "string" && address.label.trim() !== "" ? address.label.trim() : "Delivery address",
    addressText: address.addressText.trim(),
    landmark:
      typeof address.landmark === "string" && address.landmark.trim() !== "" ? address.landmark.trim() : null,
    instructions:
      typeof address.instructions === "string" && address.instructions.trim() !== ""
        ? address.instructions.trim()
        : null,
    lat: address.lat,
    lng: address.lng,
  };
}

export function writeAddress(address: DeliveryAddress): void {
  try {
    window.localStorage.setItem(ADDRESS_KEY, JSON.stringify(address));
  } catch {
    // The cookie still carries the point; only the text fields are lost.
  }
}

export function readCustomer(): CustomerContact | null {
  const value = readJson(CUSTOMER_KEY);
  if (typeof value !== "object" || value === null) return null;

  const customer = value as Record<string, unknown>;
  if (typeof customer.name !== "string" || typeof customer.phone !== "string") return null;
  if (customer.name.trim() === "" || customer.phone.trim() === "") return null;

  return { name: customer.name.trim(), phone: customer.phone.trim() };
}

export function writeCustomer(customer: CustomerContact): void {
  try {
    window.localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
  } catch {
    // Convenience only.
  }
}

export function saveOrderToken(orderNumber: string, token: string): void {
  writeMap(ORDER_TOKENS_KEY, { ...readMap(ORDER_TOKENS_KEY), [orderNumber.toUpperCase()]: token });
}

export function readOrderToken(orderNumber: string): string | null {
  return readMap(ORDER_TOKENS_KEY)[orderNumber.toUpperCase()] ?? null;
}

export function saveOrderPhone(orderNumber: string, phone: string): void {
  writeMap(ORDER_PHONES_KEY, { ...readMap(ORDER_PHONES_KEY), [orderNumber.toUpperCase()]: phone });
}

export function readOrderPhone(orderNumber: string): string | null {
  return readMap(ORDER_PHONES_KEY)[orderNumber.toUpperCase()] ?? null;
}
