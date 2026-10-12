"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, useToast } from "@kanofood/ui";

/**
 * A button that posts and refreshes.
 *
 * The third shape of write in the admin interface, and the one that has no form
 * and nothing to fill in: reconcile this payment, receive this handover. Those
 * are single decisions about a single row, and wrapping each one in a form with
 * a Save button would imply there is something to decide twice.
 *
 * Where a body is needed it is fixed at render time, so this never invents a
 * value. Anything a person has to type goes through `AdminForm` instead.
 */
export interface AdminActionProps {
  readonly action: string;
  readonly method?: "POST" | "PATCH" | "DELETE";
  /** A fixed body. Omitted sends none. */
  readonly body?: Readonly<Record<string, unknown>>;
  readonly label: string;
  readonly successMessage: string;
  readonly variant?: "primary" | "secondary" | "ghost" | "danger";
  readonly size?: "sm" | "md";
}

export function AdminAction({
  action,
  method = "POST",
  body,
  label,
  successMessage,
  variant = "secondary",
  size = "sm",
}: AdminActionProps) {
  const router = useRouter();
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(action, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: { message?: string } };

      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? "That did not go through.");
        setBusy(false);
        return;
      }

      toast?.push(successMessage);
      setBusy(false);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  return (
    <div>
      <Button type="button" variant={variant} size={size} loading={busy} onClick={() => void run()}>
        {label}
      </Button>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
