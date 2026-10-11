"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@kanofood/ui";

/**
 * The admin sidebar.
 *
 * A client component for one reason: `aria-current` needs the current path, and
 * a server layout does not get one. The CSS collapses this to a horizontal strip
 * below 1024px, so an operator checking an order from outside the office gets
 * the same links without a drawer and without a second component.
 *
 * Grouping follows the order an operator's attention moves in: what is happening
 * now, then who is delivering it, then the money, then the things that went
 * wrong, then configuration. All twelve screens of UX_SPEC section 7 are
 * reachable from here and nothing is more than one click away.
 */

interface NavItem {
  readonly href: string;
  readonly label: string;
}

interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

const GROUPS: readonly NavGroup[] = [
  {
    label: "Operations",
    items: [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/orders", label: "Orders" },
    ],
  },
  {
    label: "Network",
    items: [
      { href: "/admin/kitchens", label: "Kitchens" },
      { href: "/admin/riders", label: "Riders" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/admin/cash", label: "Cash" },
      { href: "/admin/settlements", label: "Settlements" },
    ],
  },
  {
    label: "Review",
    items: [
      { href: "/admin/failures", label: "Cancellations" },
      { href: "/admin/analytics", label: "Analytics" },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/admin/zones", label: "Zones and fees" },
      { href: "/admin/settings", label: "Settings" },
    ],
  },
];

/** True when `href` is the section this path is inside. */
function isCurrent(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
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

export { GROUPS as ADMIN_NAV_GROUPS };
