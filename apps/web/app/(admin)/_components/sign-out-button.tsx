"use client";

import { useState } from "react";

import { Button } from "@kanofood/ui";

/**
 * Sign out.
 *
 * Posts to the same endpoint every role uses, then does a full navigation rather
 * than a client transition. A full navigation guarantees the browser has dropped
 * the response cookies before the next server render asks for them, which a
 * client transition does not, and the one moment that has to be reliable is the
 * one where someone is walking away from a shared machine.
 */
export function SignOutButton({ signInPath = "/admin/sign-in" }: { readonly signInPath?: string }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);

    try {
      await fetch("/api/v1/auth/sign-out", { method: "POST" });
    } catch {
      // A sign-out that fails to reach the server still has to take the operator
      // away from the screen. The cookies are cleared by the same request when it
      // does arrive, and the access token expires within minutes regardless.
    }

    window.location.replace(signInPath);
  }

  return (
    <Button variant="ghost" size="sm" onClick={() => void signOut()} loading={busy}>
      Sign out
    </Button>
  );
}
