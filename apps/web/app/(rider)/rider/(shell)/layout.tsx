import Link from "next/link";
import type { ReactNode } from "react";

import { Badge, ToastProvider } from "@kanofood/ui";

import { RIDER_SIGN_IN_PATH, requireRider } from "@/lib/rider/session";
import { SessionKeepAlive } from "@/app/(admin)/_components/session-keep-alive";
import { SignOutButton } from "@/app/(admin)/_components/sign-out-button";

/**
 * The guarded rider shell.
 *
 * Same shape as the kitchen shell and for the same reason: the `(shell)` group
 * keeps `/rider/sign-in` outside the guard, so the page that creates a session
 * is not rendered through a layout that requires one.
 *
 * Deliberately not a sidebar. A rider is holding a phone in one hand, so the
 * furniture is a single sticky top bar with the rider's name and one way out,
 * and the content below is the list. Navigation is a back link on each screen
 * rather than a nav rail, because there are only two screens a rider opens.
 */

const brand = process.env.BRAND_NAME ?? "KanoFood";

export const dynamic = "force-dynamic";

export default async function RiderShellLayout({ children }: { children: ReactNode }) {
  const actor = await requireRider();

  return (
    <ToastProvider>
      <SessionKeepAlive signInPath={RIDER_SIGN_IN_PATH} />

      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          maxWidth: "640px",
          margin: "0 auto",
        }}
      >
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-2)",
            padding: "var(--space-3) var(--space-4)",
            borderBottom: "1px solid var(--border, #e5e5e5)",
            background: "var(--surface, #fff)",
          }}
        >
          <Link
            href="/rider"
            style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", textDecoration: "none" }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "32px",
                height: "32px",
                borderRadius: "var(--radius-sm)",
                fontWeight: 700,
              }}
            >
              {brand.slice(0, 1)}
            </span>
            <span style={{ fontWeight: 600 }}>{actor.name}</span>
          </Link>

          <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <Badge tone={actor.isActive ? "neutral" : "danger"}>
              {actor.isActive ? "Rider" : "Deactivated"}
            </Badge>
            <SignOutButton signInPath={RIDER_SIGN_IN_PATH} />
          </span>
        </header>

        <main style={{ flex: 1, padding: "var(--space-4)" }}>{children}</main>
      </div>
    </ToastProvider>
  );
}
