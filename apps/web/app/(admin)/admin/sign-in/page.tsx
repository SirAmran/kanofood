import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardBody, Stack } from "@kanofood/ui";

import { getAdmin } from "@/lib/admin/session";
import { SignInForm } from "./sign-in-form";

/**
 * Admin sign-in. Screen 7.1 in docs/UX_SPEC.md.
 *
 * Deliberately outside the guarded shell route group, because a layout that
 * requires a session cannot also render the page that creates one. This is the
 * only screen under /admin that is reachable without a session, and it renders
 * no data.
 *
 * There is no "remember me", no password reset link and no sign-up: the first
 * two are not built, and the third does not exist because staff accounts are
 * made by an admin. A link that goes nowhere is worse than its absence.
 */

const brand = process.env.BRAND_NAME ?? "KanoFood";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminSignInPage() {
  // Already signed in: there is nothing to do here.
  if (await getAdmin()) redirect("/admin");

  return (
    <main className="kf-signin">
      <div className="kf-signin__panel">
        <Stack>
          <div>
            <h1 className="kf-page-header__title">{brand} admin</h1>
            <p className="kf-muted" style={{ marginTop: "var(--space-1)" }}>
              Staff only. Every action here is recorded against your account.
            </p>
          </div>

          <Card>
            <CardBody>
              <SignInForm />
            </CardBody>
          </Card>
        </Stack>
      </div>
    </main>
  );
}
