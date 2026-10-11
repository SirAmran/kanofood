"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Field, Input, Stack } from "@kanofood/ui";

/**
 * The admin sign-in form.
 *
 * Client side because it posts and has to show what came back. It calls the same
 * `/api/v1/auth/sign-in` every other role uses: one endpoint, separated by the
 * role on the account rather than by which URL was used, which is what keeps the
 * authentication surface to a single implementation.
 *
 * The role check here is a courtesy, not a boundary. A kitchen account that
 * signs in through this page gets a real session and is then told it is not an
 * admin; the shell's guard is what actually keeps them out. Note the refusal is
 * the same sentence for every failure, so this page cannot be used to discover
 * which phone numbers hold accounts.
 */

const REFUSED = "Those details do not match an admin account.";

export function SignInForm() {
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

      if (payload.data?.user?.role !== "admin") {
        // A real session was opened for a real account that is not an admin.
        // Close it rather than leaving a live session behind a page that will
        // refuse it on the next request.
        await fetch("/api/v1/auth/sign-out", { method: "POST" });
        setError(REFUSED);
        setBusy(false);
        return;
      }

      // The guard reads the cookie on the server, so the navigation has to be a
      // fresh request rather than a client transition: `refresh` re-runs the
      // server components and the new cookie is present by then.
      router.replace("/admin");
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
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "identifier-error" : undefined}
          />
        </Field>

        <Field label="Password" htmlFor="password" required>
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={error ? true : undefined}
          />
        </Field>

        <Button type="submit" variant="primary" block loading={busy}>
          {busy ? "Signing in" : "Sign in"}
        </Button>
      </Stack>
    </form>
  );
}
