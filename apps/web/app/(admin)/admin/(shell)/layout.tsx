import Link from "next/link";
import type { ReactNode } from "react";

import { Avatar, ToastProvider } from "@kanofood/ui";

import { requireAdmin } from "@/lib/admin/session";
import { AdminNav } from "../../_components/admin-nav";
import { NotificationBell } from "../../_components/notification-bell";
import { SessionKeepAlive } from "../../_components/session-keep-alive";
import { SignOutButton } from "../../_components/sign-out-button";

/**
 * The guarded admin shell.
 *
 * A second route group, `(shell)`, nested inside `(admin)`. Route groups do not
 * appear in the URL, so these screens are still `/admin/...`; what the nesting
 * buys is a layout boundary that `/admin/sign-in` sits outside of. A layout that
 * requires a session cannot be the same layout that renders the page creating
 * one.
 *
 * The guard runs first and redirects before any child renders, so no screen
 * below this point needs to reason about an anonymous visitor.
 *
 * The shell itself is a server component. The three client pieces inside it are
 * the ones that genuinely need the browser: the nav (aria-current), the
 * keep-alive (a timer), and sign out (a post).
 */

const brand = process.env.BRAND_NAME ?? "KanoFood";

export const dynamic = "force-dynamic";

export default async function AdminShellLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();

  return (
    <ToastProvider>
      <SessionKeepAlive />

      <div className="kf-shell">
        <aside className="kf-shell__sidebar">
          <Link href="/admin" className="kf-shell__brand">
            <span className="kf-shell__mark" aria-hidden="true">
              {brand.slice(0, 1)}
            </span>
            <span className="kf-shell__brand-name">{brand}</span>
          </Link>

          <AdminNav />

          <div className="kf-shell__footer" style={{ marginTop: "auto" }}>
            <div className="kf-truncate" title={admin.name}>
              {admin.name}
            </div>
            <div>{admin.email ?? admin.phone ?? ""}</div>
          </div>
        </aside>

        <div className="kf-shell__main">
          <header className="kf-shell__topbar">
            <span className="kf-muted">Admin</span>

            <span className="kf-cluster">
              <NotificationBell orderHrefBase="/admin/orders" />
              <Avatar name={admin.name} />
              <SignOutButton />
            </span>
          </header>

          <main className="kf-shell__content">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
