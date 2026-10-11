import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "../cn";

/**
 * Form controls.
 *
 * Every control is wrapped by `Field`, which owns the label, the help text and
 * the error text. That wrapper is why a screen never hand-rolls a label and why
 * an error is always in the same place: UX_SPEC section 3 requires real labels
 * on every input and errors announced to assistive technology, and both are
 * only reliably true if there is one component doing it.
 *
 * The error is wired with `aria-describedby` and the field carries
 * `aria-invalid`, so a screen reader reads the message when it reaches the
 * input rather than leaving the reader to find it.
 */

export interface FieldProps {
  readonly label: string;
  readonly htmlFor?: string;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly required?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

function describedBy(id: string | undefined, hint: ReactNode, error: ReactNode) {
  if (!id) return undefined;
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("kf-field", className)}>
      <label className="kf-label" htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="kf-label__required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <span className="kf-hint" id={htmlFor ? `${htmlFor}-hint` : undefined}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="kf-field__error" id={htmlFor ? `${htmlFor}-error` : undefined} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "name"> {
  readonly name: string;
}

export function Input({ className, id, name, ...rest }: InputProps) {
  return <input {...rest} id={id ?? name} name={name} className={cn("kf-input", className)} />;
}

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name"> {
  readonly name: string;
}

export function Textarea({ className, id, name, rows = 3, ...rest }: TextareaProps) {
  return (
    <textarea
      {...rest}
      id={id ?? name}
      name={name}
      rows={rows}
      className={cn("kf-textarea", className)}
    />
  );
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "name"> {
  readonly name: string;
}

export function Select({ className, id, name, children, ...rest }: SelectProps) {
  return (
    <select {...rest} id={id ?? name} name={name} className={cn("kf-select", className)}>
      {children}
    </select>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "type"> {
  readonly name: string;
  readonly label: ReactNode;
  readonly description?: ReactNode;
}

export function Checkbox({ className, id, name, label, description, ...rest }: CheckboxProps) {
  const controlId = id ?? name;
  return (
    <label className={cn("kf-checkbox", className)} htmlFor={controlId}>
      <input {...rest} type="checkbox" id={controlId} name={name} />
      <span className="kf-checkbox__body">
        <span className="kf-checkbox__label">{label}</span>
        {description ? <span className="kf-hint">{description}</span> : null}
      </span>
    </label>
  );
}

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "type"> {
  readonly name: string;
  readonly label: ReactNode;
}

export function Radio({ className, id, name, label, ...rest }: RadioProps) {
  const controlId = id ?? `${name}-${String(rest.value ?? "")}`;
  return (
    <label className={cn("kf-radio", className)} htmlFor={controlId}>
      <input {...rest} type="radio" id={controlId} name={name} />
      <span>{label}</span>
    </label>
  );
}

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "type"> {
  readonly name: string;
  readonly label: ReactNode;
}

/**
 * A switch is a control that takes effect immediately, which is why it is not
 * a checkbox: the kitchen open/closed toggle and a menu item's availability are
 * switches, not choices submitted with a form.
 */
export function Switch({ className, id, name, label, ...rest }: SwitchProps) {
  const controlId = id ?? name;
  return (
    <label className={cn("kf-switch", className)} htmlFor={controlId}>
      <input {...rest} type="checkbox" role="switch" id={controlId} name={name} />
      <span className="kf-switch__track" aria-hidden="true">
        <span className="kf-switch__thumb" />
      </span>
      <span>{label}</span>
    </label>
  );
}

/** Re-exported so a control can wire its own aria attributes consistently. */
export { describedBy as fieldDescribedBy };
