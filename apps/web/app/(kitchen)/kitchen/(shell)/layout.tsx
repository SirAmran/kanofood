import Link from "next/link";
import type { ReactNode } from "react";

import { Avatar, Badge, ToastProvider } from "@kanofood/ui";

import { KITCHEN_SIGN_IN_PATH, requireKitchen } from "@/lib/kitchen/session";
import { KitchenNav } from "../../_components/kitchen-nav";
import { NotificationBell } from "@/app/(admin)/_components/notification-bell";
import { SessionKeepAlive } from "@/app/(admin)/_components/session-keep-alive";
import { SignOutButton } from "@/app/(admin)/_components/sign-out-button";

/**
 * The guarded kitchen shell.
 *
 * Same shape as the admin shell, and for the same reason: the `(shell)` group
 * keeps `/kitchen/sign-in` outside the guard, so the page that creates a session
 * is not rendered through a layout that requires one.
 *
 * The guard resolves the kitchen, not just the role. Every screen below this
 * point can take `kitchenId` from the layout's result and trust it.
 *
 * The keep-alive and sign-out components are the admin ones, parameterised with
 * the kitchen sign-in path. They are role-agnostic: the refresh endpoint rotates
 * by session, and sign-out revokes the same cookies whatever the account is.
 */

const brand = process.env.BRAND_NAME ?? "KanoFood";

export const dynamic = "force-dynamic";

export default async function KitchenShellLayout({ children }: { children: ReactNode }) {
  const actor = await requireKitchen();

  return (
    <ToastProvider>
      <SessionKeepAlive signInPath={KITCHEN_SIGN_IN_PATH} />

      <div className="kf-shell">
        <aside className="kf-shell__sidebar">
          <Link href="/kitchen" className="kf-shell__brand">
            <span className="kf-shell__mark" aria-hidden="true">
              {brand.slice(0, 1)}
            </span>
            <span className="kf-shell__brand-name">{brand}</span>
          </Link>

          <KitchenNav />

          <div className="kf-shell__footer" style={{ marginTop: "auto" }}>
            <div className="kf-truncate" title={actor.kitchenName}>
              {actor.kitchenName}
            </div>
            <div className="kf-truncate">{actor.name}</div>
          </div>
        </aside>

        <div className="kf-shell__main">
          <header className="kf-shell__topbar">
            <span className="kf-cluster">
              <Badge tone={actor.kitchenIsActive ? "neutral" : "danger"}>
                {actor.kitchenIsActive ? "Kitchen" : "Suspended"}
              </Badge>
            </span>

            <span className="kf-cluster">
              <NotificationBell orderHrefBase="/kitchen/orders" />
              <Avatar name={actor.name} />
              <SignOutButton signInPath={KITCHEN_SIGN_IN_PATH} />
            </span>
          </header>

          <main className="kf-shell__content">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
