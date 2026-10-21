import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardBody, Stack } from "@kanofood/ui";

import { getKitchenActor } from "@/lib/kitchen/session";
import { KitchenSignInForm } from "./sign-in-form";

/**
 * Kitchen sign-in. Screen 5.1 in docs/UX_SPEC.md.
 *
 * Outside the guarded shell, because the shell's guard would redirect this page
 * to itself. It renders no data and is the only kitchen screen reachable without
 * a session.
 *
 * No "remember me", no password reset, no sign-up: accounts are created by the
 * platform, and a link that goes nowhere is worse than its absence.
 */

const brand = process.env.BRAND_NAME ?? "KanoFood";

export const metadata: Metadata = {
  title: "Kitchen sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function KitchenSignInPage() {
  if (await getKitchenActor()) redirect("/kitchen");

  return (
    <main className="kf-signin">
      <div className="kf-signin__panel">
        <Stack>
          <div>
            <h1 className="kf-page-header__title">{brand} kitchen</h1>
            <p className="kf-muted" style={{ marginTop: "var(--space-1)" }}>
              For kitchen staff. Every order you accept or reject is recorded against your account.
            </p>
          </div>

          <Card>
            <CardBody>
              <KitchenSignInForm />
            </CardBody>
          </Card>
        </Stack>
      </div>
    </main>
  );
}
