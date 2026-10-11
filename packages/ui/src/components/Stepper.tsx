"use client";

import { useState } from "react";

import { cn } from "../cn";

/**
 * Quantity stepper.
 *
 * A controlled input, not an uncontrolled one: the caller owns the number, so
 * the same component works for a cart line, a stock count and a rider's order
 * limit without any of them having to reach into the DOM.
 *
 * Both buttons are real buttons and the value is a real input, so it is
 * reachable and typeable by keyboard as well as tappable. The input is narrow
 * but not so narrow that a two-digit number is clipped.
 */

export interface StepperProps {
  readonly value: number;
  readonly onChange: (next: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly name?: string;
  readonly disabled?: boolean;
  /** Read out with the buttons, so "minus" says what it is minusing. */
  readonly label?: string;
  readonly className?: string;
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  name,
  disabled = false,
  label,
  className,
}: StepperProps) {
  // The field is a text box so a person can clear it and type, which means the
  // value it reports is sometimes not a number. Holding that in state locally
  // stops a half-typed value from being clamped out from under the caret.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);

  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  const commit = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    setDraft(null);
    if (Number.isNaN(parsed)) {
      onChange(clamp(value));
      return;
    }
    onChange(clamp(parsed));
  };

  return (
    <div className={cn("kf-stepper", className)}>
      <button
        type="button"
        className="kf-stepper__btn"
        onClick={() => onChange(clamp(value - step))}
        disabled={disabled || value <= min}
        aria-label={label ? `Decrease ${label}` : "Decrease"}
      >
        &minus;
      </button>
      <input
        className="kf-stepper__value"
        type="text"
        inputMode="numeric"
        name={name}
        value={shown}
        disabled={disabled}
        aria-label={label ?? "Quantity"}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit((event.target as HTMLInputElement).value);
          }
        }}
      />
      <button
        type="button"
        className="kf-stepper__btn"
        onClick={() => onChange(clamp(value + step))}
        disabled={disabled || value >= max}
        aria-label={label ? `Increase ${label}` : "Increase"}
      >
        +
      </button>
    </div>
  );
}
