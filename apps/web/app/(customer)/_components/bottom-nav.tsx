"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@kanofood/ui";

import { useCart } from "./cart-provider";

/**
 * The customer's bottom bar, on a phone only.
 *
 * Netflix is the reference and the reason is the same: the four places a person
 * actually goes should be one thumb away, at a fixed height, with the current
 * one obvious without reading. The header keeps the brand; this keeps the
 * navigation. Above 900px there is room for the header and the rail, so the bar
 * disappears rather than becoming a second desktop menu.
 *
 * The cart carries its own live count. It is the one item in the bar whose label
 * changes while the customer shops, and putting it here means adding a dish no
 * longer requires scrolling back to the header.
 */

interface Item {
  readonly href: string;
  readonly label: string;
  readonly icon: "home" | "browse" | "search" | "cart";
}

const ITEMS: readonly Item[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/kitchens", label: "Browse", icon: "browse" },
  { href: "/search", label: "Search", icon: "search" },
  { href: "/cart", label: "Cart", icon: "cart" },
];

function current(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Icon({ name }: { readonly name: Item["icon"] }) {
  if (name === "home") {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />
      </svg>
    );
  }

  if (name === "browse") {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
        <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.55L21 8H6" />
      <circle cx="10" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { count, hydrated } = useCart();

  return (
    <nav className="sf-bottomnav" aria-label="Storefront">
      {ITEMS.map((item) => {
        const active = current(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn("sf-bottomnav__item", active && "sf-bottomnav__item--active")}
            aria-current={active ? "page" : undefined}
          >
            <span className="sf-bottomnav__icon">
              <Icon name={item.icon} />
              {item.icon === "cart" && hydrated && count > 0 ? (
                <span className="sf-bottomnav__count">{count > 9 ? "9+" : count}</span>
              ) : null}
            </span>
            <span className="sf-bottomnav__label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
