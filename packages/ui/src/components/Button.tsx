import type { ButtonHTMLAttributes } from "react";

import { cn } from "../cn";

/**
 * Button.
 *
 * Four variants, three sizes. The default is `secondary`, not `primary`, on
 * purpose: the standard is one accent used sparingly, and a default of primary
 * makes every stray button shout. A screen that wants the accent asks for it.
 *
 * `loading` disables the button as well as showing progress. UX_SPEC section 8
 * requires that every submit is retry-safe and never double-submits, and the
 * cheapest place to enforce that is here rather than in each form.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: readonly ButtonVariant[] = ["primary", "secondary", "ghost", "danger"];

/** The class string for a button, so a link can wear one without a component. */
export function buttonClass(options?: {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly block?: boolean;
  readonly className?: string;
}): string {
  const variant = options?.variant ?? "secondary";
  const size = options?.size ?? "md";

  return cn(
    "kf-btn",
    `kf-btn--${variant}`,
    size !== "md" && `kf-btn--${size}`,
    options?.block && "kf-btn--block",
    options?.className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly block?: boolean;
  /** Shows progress and refuses further presses. */
  readonly loading?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  block = false,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  // A typo in a variant would otherwise render an unstyled button, which looks
  // like a styling bug rather than a mistake in the caller.
  if (!VARIANTS.includes(variant)) {
    throw new Error(`Unknown button variant: ${String(variant)}`);
  }

  return (
    <button
      {...rest}
      type={type}
      className={buttonClass({ variant, size, block, className })}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="kf-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
