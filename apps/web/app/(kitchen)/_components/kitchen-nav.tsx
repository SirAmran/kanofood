"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@kanofood/ui";

/**
 * The kitchen sidebar.
 *
 * Five links, ordered the way a shift runs: what is happening now, what is being
 * cooked, what is on the menu, how the week went, then the profile and the open
 * switch. Screens 5.2 to 5.8 in docs/UX_SPEC.md, with the menu editor reached
 * from the menu list rather than cluttering this column.
 *
 * The CSS collapses it to a horizontal strip on a phone, so the same links work
 * on the tablet on the wall and on the phone in someone's hand.
 */

const GROUPS = [
  {
    label: "Service",
    items: [
      { href: "/kitchen", label: "Dashboard" },
      { href: "/kitchen/orders", label: "Orders" },
    ],
  },
  {
    label: "Kitchen",
    items: [
      { href: "/kitchen/menu", label: "Menu" },
      { href: "/kitchen/analytics", label: "Analytics" },
      { href: "/kitchen/settings", label: "Settings" },
    ],
  },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/kitchen") return pathname === "/kitchen";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function KitchenNav() {
  const pathname = usePathname();

  return (
    <>
      {GROUPS.map((group) => (
        <div key={group.label}>
          <div className="kf-shell__group">{group.label}</div>
          <nav className="kf-shell__nav" aria-label={group.label}>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn("kf-shell__link")}
                aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ))}
    </>
  );
}
