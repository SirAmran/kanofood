"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Modal, Stack, useToast } from "@kanofood/ui";

/**
 * A delete, behind a dialog.
 *
 * Two steps because a delete cannot be undone and the button that does it sits
 * in a list of buttons that can. The dialog names the thing being deleted, which
 * is the part that catches a mis-click: "Delete Jollof Rice" is a question
 * somebody can answer, and "Are you sure?" is not.
 *
 * The server does the refusing. This confirms; it does not guard. Nothing here
 * decides whether a delete is allowed.
 */
export interface AdminDeleteProps {
  readonly action: string;
  /** What is about to go, for the dialog and the button. */
  readonly what: string;
  readonly label?: string;
  /** What happens instead of deletion, when deletion is not the real outcome. */
  readonly warning?: string;
  readonly successMessage?: string;
  readonly redirectTo?: string;
}

export function AdminDelete({
  action,
  what,
  label = "Delete",
  warning,
  successMessage,
  redirectTo,
}: AdminDeleteProps) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(action, { method: "DELETE" });
      const payload = (await response.json()) as { ok: boolean; error?: { message?: string } };

      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? "That did not go through.");
        setBusy(false);
        return;
      }

      setOpen(false);
      setBusy(false);
      toast?.push(successMessage ?? `${what} was deleted.`);

      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="danger" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete ${what}?`}
        actions={
          <Stack tight>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Button type="button" variant="danger" loading={busy} onClick={() => void remove()} block>
              Delete {what}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy} block>
              Keep it
            </Button>
          </Stack>
        }
      >
        <p>
          This cannot be undone. {warning ?? "The record is removed from the platform."}
        </p>
      </Modal>
    </>
  );
}
