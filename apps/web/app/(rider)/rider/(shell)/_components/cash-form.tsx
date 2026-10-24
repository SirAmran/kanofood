"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Field, Input, Stack, Textarea, useToast } from "@kanofood/ui";

/**
 * What the customer actually handed over. Screen 6.4.
 *
 * The box is pre-filled with the amount the order says is due, because that is
 * what happens most of the time: a rider taps, checks the figure and carries on.
 * It exists for the other times, when the customer has no change or rounds up.
 *
 * The server reads the expected amount from the order, never from this form, so
 * a stale page cannot tell it what it was owed. What comes back is the gap, and
 * the screen says it out loud rather than storing a silent difference.
 */

export interface CashFormProps {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly expectedKobo: bigint;
}

export function CashForm({ orderId, orderNumber, expectedKobo }: CashFormProps) {
  const router = useRouter();
  const toast = useToast();

  const expected = toNairaInput(expectedKobo);
  const [amount, setAmount] = useState(expected);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [difference, setDifference] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    setDifference(null);

    try {
      const response = await fetch(`/api/v1/rider/deliveries/${orderId}/cash`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        data?: { shortfallKobo?: string; surplusKobo?: string };
        error?: { message?: string };
      };

      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? "That did not go through.");
        setBusy(false);
        return;
      }

      const short = BigInt(payload.data?.shortfallKobo ?? "0");
      const over = BigInt(payload.data?.surplusKobo ?? "0");

      if (short > 0n) {
        setDifference(`Recorded. You are ₦${toNairaInput(short)} short of the expected amount.`);
      } else if (over > 0n) {
        setDifference(`Recorded. That is ₦${toNairaInput(over)} more than was due.`);
      } else {
        setDifference(null);
        toast?.push(`Cash recorded for ${orderNumber}.`);
      }

      setBusy(false);
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
        {difference ? <Alert tone="warning">{difference}</Alert> : null}

        <Field
          label="Amount collected (₦)"
          htmlFor="amount"
          hint={`Expected ₦${expected}. Change it to what the customer actually handed over.`}
          required
        >
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            style={{ fontSize: "20px", minHeight: "52px" }}
            required
          />
        </Field>

        <Field label="Anything to say about it" htmlFor="cashNote" hint="Optional.">
          <Textarea
            id="cashNote"
            name="cashNote"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Customer had no change."
          />
        </Field>

        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Record cash
        </Button>
      </Stack>
    </form>
  );
}

/**
 * Kobo as a plain naira string for an input box.
 *
 * `formatNaira` is the one to show a human, because it rounds the way money
 * rounds; this is the one to put in a field that will be parsed back, so it
 * carries the exact kobo and no currency symbol.
 */
function toNairaInput(kobo: bigint): string {
  const negative = kobo < 0n;
  const absolute = negative ? -kobo : kobo;
  const naira = absolute / 100n;
  const koboPart = absolute % 100n;
  const text = koboPart === 0n ? naira.toString() : `${naira.toString()}.${koboPart.toString().padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}
