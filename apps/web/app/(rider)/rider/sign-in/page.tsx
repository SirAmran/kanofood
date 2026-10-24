import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardBody, Stack } from "@kanofood/ui";

import { getRiderActor } from "@/lib/rider/session";
import { RiderSignInForm } from "./sign-in-form";

/**
 * Rider sign in. Screen 6.1 in docs/UX_SPEC.md.
 *
 * Outside the guarded shell, because the shell's guard redirects this page to
 * itself. It renders no data and is the only rider screen reachable without a
 * session.
 *
 * No sign-up and no password reset: rider accounts are made by the platform.
 * The wording below is the shortest honest explanation of what this page is for,
 * because a rider meets it in daylight on a phone with one hand free.
 */

const brand = process.env.BRAND_NAME ?? "KanoFood";

export const metadata: Metadata = {
  title: "Rider sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RiderSignInPage() {
  if (await getRiderActor()) redirect("/rider");

  return (
    <main className="kf-signin">
      <div className="kf-signin__panel">
        <Stack>
          <div>
            <h1 className="kf-page-header__title">{brand} rider</h1>
            <p className="kf-muted" style={{ marginTop: "var(--space-1)" }}>
              Your deliveries for the day. Every pickup and delivery you mark is
              recorded against your account.
            </p>
          </div>

          <Card>
            <CardBody>
              <RiderSignInForm />
            </CardBody>
          </Card>
        </Stack>
      </div>
    </main>
  );
}
