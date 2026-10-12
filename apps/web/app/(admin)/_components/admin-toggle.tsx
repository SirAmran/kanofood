"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Switch, useToast } from "@kanofood/ui";

/**
 * A switch that writes the moment it is flipped.
 *
 * Opening a kitchen, marking a dish unavailable, suspending a login. These are
 * not form submissions: an operator flipping a kitchen closed at 8pm wants it
 * closed, not queued behind a Save button they might not press.
 *
 * On failure the switch goes back to where it was. A toggle that stays visually
 * flipped after the server refused it is worse than no toggle, because the
 * operator believes the thing happened.
 */
export interface AdminToggleProps {
  readonly action: string;
  /** Almost always POST. A toggle that edits a record uses that record's PATCH. */
  readonly method?: "POST" | "PATCH";
  readonly name: string;
  readonly label: string;
  readonly checked: boolean;
  /** The value sent when on. Sent as a boolean unless these are given. */
  readonly onValue?: string;
  readonly offValue?: string;
  readonly successMessage?: string;
  readonly className?: string;
}

export function AdminToggle({
  action,
  method = "POST",
  name,
  label,
  checked,
  onValue,
  offValue,
  successMessage,
  className,
}: AdminToggleProps) {
  const router = useRouter();
  const toast = useToast();

  // Local state so the switch moves under the finger rather than after the round
  // trip, and rolls back if the round trip fails.
  const [on, setOn] = useState(checked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function flip(next: boolean) {
    if (busy) return;

    setOn(next);
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(action, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          [name]: onValue !== undefined || offValue !== undefined ? (next ? onValue : offValue) : next,
        }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: { message?: string } };

      if (!response.ok || !payload.ok) {
        setOn(!next);
        setError(payload.error?.message ?? "That did not save.");
        setBusy(false);
        return;
      }

      if (successMessage) toast?.push(successMessage);
      setBusy(false);
      router.refresh();
    } catch {
      setOn(!next);
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Switch
        name={name}
        label={label}
        checked={on}
        disabled={busy}
        onChange={(event) => void flip(event.target.checked)}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
