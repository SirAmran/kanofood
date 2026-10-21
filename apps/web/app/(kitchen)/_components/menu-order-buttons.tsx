"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, useToast } from "@kanofood/ui";

/**
 * Dish ordering. Two small buttons on each row, because the thing being changed
 * is the order of a list and the smallest honest control for that is "up one" and
 * "down one". Drag and drop is not offered: it needs a mouse, it is invisible to
 * a screen reader unless a whole keyboard path is built behind it, and a kitchen
 * does this on a phone at least as often as at a desk.
 *
 * The server renumbers the section, so a click is one request and the page
 * refreshes to the real order rather than to a guess. A failed move leaves the
 * list exactly where it was and says so.
 */

export interface MenuOrderButtonsProps {
  readonly itemId: string;
  readonly name: string;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
}

export function MenuOrderButtons({ itemId, name, canMoveUp, canMoveDown }: MenuOrderButtonsProps) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"up" | "down" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function move(direction: "up" | "down") {
    if (busy) return;
    setBusy(direction);
    setError(null);

    try {
      const response = await fetch(`/api/v1/kitchen/menu/items/${itemId}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: { message?: string } };

      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? "That move did not go through.");
        setBusy(null);
        return;
      }

      toast?.push(`${name} moved ${direction}.`);
      setBusy(null);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check the connection and try again.");
      setBusy(null);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="kf-btn kf-btn--ghost kf-btn--sm"
        aria-label={`Move ${name} up`}
        disabled={!canMoveUp || busy !== null}
        onClick={() => void move("up")}
      >
        {busy === "up" ? "..." : "↑"}
      </button>
      <button
        type="button"
        className="kf-btn kf-btn--ghost kf-btn--sm"
        aria-label={`Move ${name} down`}
        disabled={!canMoveDown || busy !== null}
        onClick={() => void move("down")}
      >
        {busy === "down" ? "..." : "↓"}
      </button>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
