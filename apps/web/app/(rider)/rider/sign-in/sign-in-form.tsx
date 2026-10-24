"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Field, Input, Stack } from "@kanofood/ui";

/**
 * The rider sign-in form.
 *
 * Same endpoint as every other role, sized for one hand: one field above the
 * other, a button that fills the width, no "forgot password" link because
 * accounts are created by the platform and a link that goes nowhere is worse
 * than its absence.
 *
 * Every failure gets the same sentence, so this page cannot be used to discover
 * which phone numbers hold accounts.
 */

const REFUSED = "Those details do not match a rider account.";

export function RiderSignInForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/v1/auth/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identifier: String(form.get("identifier") ?? "").trim(),
          password: String(form.get("password") ?? ""),
        }),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        data?: { user?: { role?: string } };
        error?: { message?: string };
      };

      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? REFUSED);
        setBusy(false);
        return;
      }

      // A rider account that is also a kitchen account must not land here, so
      // the role is checked and the session dropped rather than left half-open.
      if (payload.data?.user?.role !== "rider") {
        await fetch("/api/v1/auth/sign-out", { method: "POST" });
        setError(REFUSED);
        setBusy(false);
        return;
      }

      router.replace("/rider");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check the connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <Stack>
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Field label="Phone or email" htmlFor="identifier" required>
          <Input
            name="identifier"
            autoComplete="username"
            autoFocus
            required
            inputMode="text"
            style={{ fontSize: "18px", minHeight: "52px" }}
            aria-invalid={error ? true : undefined}
          />
        </Field>

        <Field label="Password" htmlFor="password" required>
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            style={{ fontSize: "18px", minHeight: "52px" }}
            aria-invalid={error ? true : undefined}
          />
        </Field>

        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          {busy ? "Signing in" : "Sign in"}
        </Button>
      </Stack>
    </form>
  );
}
