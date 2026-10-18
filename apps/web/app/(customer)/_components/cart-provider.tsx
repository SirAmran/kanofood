"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * The cart, kept in the customer's own browser storage.
 *
 * Decided 2026-10-14: a refresh must not empty a cart. There is no cart table in
 * the schema and there should not be one, because a cart is not an order until it
 * is placed. The stored shape is small, versioned by its key, and validated on
 * read so a corrupted value starts an empty cart rather than crashing the
 * storefront.
 *
 * One kitchen per cart: the schema models one order to one kitchen, so adding a
 * dish from another kitchen replaces the cart. Callers confirm before they call
 * `add`, because silently discarding a cart is the kind of surprise a customer
 * only notices at checkout.
 */

export interface CartLine {
  readonly menuItemId: string;
  readonly name: string;
  /** Integer kobo, stored as a string because JSON has no BigInt. */
  readonly priceKobo: string;
  readonly quantity: number;
  readonly notes: string | null;
}

export interface CartState {
  readonly kitchenSlug: string;
  readonly kitchenName: string;
  readonly lines: readonly CartLine[];
}

export interface CartItemInput {
  readonly id: string;
  readonly name: string;
  readonly priceKobo: string;
}

interface CartContextValue {
  readonly cart: CartState | null;
  /** False until localStorage has been read, so price totals never flash. */
  readonly hydrated: boolean;
  readonly count: number;
  readonly subtotalKobo: bigint;
  add(kitchen: { slug: string; name: string }, item: CartItemInput, quantity: number, notes?: string | null): void;
  setQuantity(menuItemId: string, quantity: number): void;
  remove(menuItemId: string): void;
  clear(): void;
}

const STORAGE_KEY = "kf_cart_v1";
const CartContext = createContext<CartContextValue | null>(null);

function parseLine(value: unknown): CartLine | null {
  if (typeof value !== "object" || value === null) return null;
  const line = value as Record<string, unknown>;
  if (typeof line.menuItemId !== "string" || typeof line.name !== "string") return null;
  if (typeof line.priceKobo !== "string" || !/^\d+$/.test(line.priceKobo)) return null;
  if (typeof line.quantity !== "number" || !Number.isInteger(line.quantity) || line.quantity < 1) return null;
  const notes = typeof line.notes === "string" && line.notes.trim() !== "" ? line.notes.trim() : null;
  return { menuItemId: line.menuItemId, name: line.name, priceKobo: line.priceKobo, quantity: line.quantity, notes };
}

function parseCart(raw: string | null): CartState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const cart = parsed as Record<string, unknown>;
    if (typeof cart.kitchenSlug !== "string" || typeof cart.kitchenName !== "string") return null;
    if (!Array.isArray(cart.lines)) return null;

    const lines = cart.lines.map(parseLine).filter((line): line is CartLine => line !== null);
    if (lines.length === 0) return null;
    return { kitchenSlug: cart.kitchenSlug, kitchenName: cart.kitchenName, lines };
  } catch {
    return null;
  }
}

export function CartProvider({ children }: { readonly children: ReactNode }) {
  const [cart, setCart] = useState<CartState | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCart(parseCart(window.localStorage.getItem(STORAGE_KEY)));
    setHydrated(true);
  }, []);

  // Write only after the first read, so an empty first render does not erase a
  // stored cart before it has been loaded.
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (cart) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage full or blocked: the cart still works for this page load.
    }
  }, [cart, hydrated]);

  const add = useCallback(
    (kitchen: { slug: string; name: string }, item: CartItemInput, quantity: number, notes?: string | null) => {
      setCart((current) => {
        const sameKitchen = current !== null && current.kitchenSlug === kitchen.slug;
        const lines = sameKitchen ? [...current.lines] : [];
        const index = lines.findIndex((line) => line.menuItemId === item.id);
        const note = notes?.trim() ? notes.trim().slice(0, 300) : null;

        if (index >= 0) {
          const existing = lines[index]!;
          lines[index] = {
            ...existing,
            quantity: Math.min(50, existing.quantity + quantity),
            notes: note ?? existing.notes,
          };
        } else {
          lines.push({
            menuItemId: item.id,
            name: item.name,
            priceKobo: item.priceKobo,
            quantity: Math.min(50, Math.max(1, quantity)),
            notes: note,
          });
        }

        return { kitchenSlug: kitchen.slug, kitchenName: kitchen.name, lines };
      });
    },
    [],
  );

  const setQuantity = useCallback((menuItemId: string, quantity: number) => {
    setCart((current) => {
      if (!current) return current;
      const next = Math.min(50, Math.max(0, Math.trunc(quantity)));
      const lines = next === 0
        ? current.lines.filter((line) => line.menuItemId !== menuItemId)
        : current.lines.map((line) =>
            line.menuItemId === menuItemId ? { ...line, quantity: next } : line,
          );
      return lines.length === 0 ? null : { ...current, lines };
    });
  }, []);

  const remove = useCallback((menuItemId: string) => {
    setCart((current) => {
      if (!current) return current;
      const lines = current.lines.filter((line) => line.menuItemId !== menuItemId);
      return lines.length === 0 ? null : { ...current, lines };
    });
  }, []);

  const clear = useCallback(() => setCart(null), []);

  const value = useMemo<CartContextValue>(() => {
    const count = cart?.lines.reduce((total, line) => total + line.quantity, 0) ?? 0;
    const subtotalKobo =
      cart?.lines.reduce((total, line) => total + BigInt(line.priceKobo) * BigInt(line.quantity), 0n) ?? 0n;

    return { cart, hydrated, count, subtotalKobo, add, setQuantity, remove, clear };
  }, [cart, hydrated, add, setQuantity, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider.");
  return value;
}
