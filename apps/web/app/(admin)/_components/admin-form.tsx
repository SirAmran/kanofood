"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Button, Field, Input, Select, Stack, Switch, Textarea, useToast } from "@kanofood/ui";

import { MapPicker } from "@/components/map-picker";

/**
 * The admin form.
 *
 * One form component for every edit an operator makes that is not an order
 * action. Kitchens, menu items, riders, zones and settings are all "show some
 * fields, post them, refresh", and the version of this that exists five times is
 * the version where four of them handle a failed response slightly differently.
 *
 * Fields are described rather than written as JSX. That is what makes it
 * reusable, and it is also what makes the error handling real: every field
 * declares its name, so a validation failure from the API can be put back on the
 * input that caused it instead of appearing as one sentence at the top.
 */

export type AdminFieldType =
  | "text"
  | "email"
  | "password"
  | "number"
  | "money"
  | "date"
  | "textarea"
  | "select"
  | "switch"
  | "map";

export interface AdminField {
  readonly name: string;
  readonly label: string;
  readonly type: AdminFieldType;
  /** The starting value. A switch is on when this is `true`. */
  readonly value?: string | number | boolean | null;
  /**
   * For type `"map"`: the name of the field that carries the longitude.
   *
   * A map is one control and two columns, and the API validates them as a pair
   * under `lat` and `lng`. The map field's own `name` is the latitude and this
   * names the longitude, so a screen describes one field and the form submits
   * two, without either screen hand-rolling the pairing.
   */
  readonly lngField?: string;
  /** For type `"map"`: the starting longitude. See `lngField`. */
  readonly lngValue?: string | number | null;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  readonly hint?: string;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly rows?: number;
  /** A read-only field is shown but not sent, for a value that cannot change. */
  readonly readOnly?: boolean;
  /**
   * Send an empty string when the box is empty, rather than omitting the field.
   *
   * An omitted field means "leave it alone" and an empty one means "clear it", so
   * a field whose empty state is a real answer (a contact number falling back to
   * the environment, a cleared map pin) has to say so. Without this the clear
   * never reaches the API and the old value survives an edit that visibly
   * removed it.
   */
  readonly sendEmpty?: boolean;
}

/** What the API's validation failure looks like, so it can be routed to a field. */
interface FieldIssue {
  readonly field: string;
  readonly message: string;
}

export interface AdminFormProps {
  /** Where to post. A full path, for example `/api/v1/admin/kitchens`. */
  readonly action: string;
  readonly method?: "POST" | "PATCH" | "PUT" | "DELETE";
  readonly fields: readonly AdminField[];
  readonly submitLabel: string;
  /** Shown as a toast on success. */
  readonly successMessage: string;
  /** Extra values sent alongside the fields and never shown. */
  readonly hidden?: Readonly<Record<string, string>>;
  /** Where to go afterwards. Omitted means stay and refresh, for an inline edit. */
  readonly redirectTo?: string;
  /** A danger submit draws attention to what it does. */
  readonly tone?: "primary" | "danger";
  readonly className?: string;
}

function initial(field: AdminField): string | boolean {
  if (field.type === "switch") return field.value === true;
  if (field.value === null || field.value === undefined) return "";
  return String(field.value);
}

/**
 * The starting values, including the longitude a map field names but does not
 * describe. Without this the pair would submit empty on a screen that has a pin.
 */
function initialValues(fields: readonly AdminField[]): Record<string, string | boolean> {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const entries: [string, string | boolean][] = [[field.name, initial(field)]];
      if (field.type === "map" && field.lngField) {
        entries.push([
          field.lngField,
          field.lngValue === null || field.lngValue === undefined ? "" : String(field.lngValue),
        ]);
      }
      return entries;
    }),
  );
}

/** A map hands back numbers; the form holds strings, because that is what a field submits. */
function numberOrNull(value: string | boolean | undefined): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function AdminForm({
  action,
  method = "POST",
  fields,
  submitLabel,
  successMessage,
  hidden,
  redirectTo,
  tone = "primary",
  className,
}: AdminFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    initialValues(fields),
  );
  const [issues, setIssues] = useState<readonly FieldIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set(name: string, value: string | boolean) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function issueFor(name: string): string | undefined {
    return issues.find((issue) => issue.field === name)?.message;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    setIssues([]);

    // Only the fields the form owns are sent, plus the hidden ones. A switch
    // goes as a boolean; everything else goes as the string that was typed,
    // because the API parses money and numbers with its own schema and a
    // number parsed twice is a number parsed differently.
    const body: Record<string, unknown> = { ...hidden };
    for (const field of fields) {
      if (field.readOnly) continue;
      const value = values[field.name];
      if (field.type === "switch") {
        body[field.name] = value === true;
      } else if (field.type === "map") {
        // A coordinate pair goes together and an empty string is a real answer:
        // it is how a pin is cleared. Omitting them instead would leave the old
        // point on the record after a save that visibly removed it.
        body[field.name] = typeof value === "string" ? value.trim() : "";
        if (field.lngField) {
          const lng = values[field.lngField];
          body[field.lngField] = typeof lng === "string" ? lng.trim() : "";
        }
      } else if (typeof value === "string" && value.trim() !== "") {
        body[field.name] = value;
      } else if (field.required || field.sendEmpty) {
        body[field.name] = "";
      }
    }

    try {
      const response = await fetch(action, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        error?: { message?: string; details?: { issues?: readonly FieldIssue[] } };
      };

      if (!response.ok || !payload.ok) {
        setError(payload.error?.message ?? "That did not save.");
        setIssues(payload.error?.details?.issues ?? []);
        setBusy(false);
        return;
      }

      toast?.push(successMessage);
      setBusy(false);

      if (redirectTo) {
        router.push(redirectTo);
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Check the connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className={className}>
      <Stack>
        {error ? <Alert tone="danger">{error}</Alert> : null}

        {fields.map((field) => {
          const value = values[field.name];
          const errorText = issueFor(field.name);
          const id = `field-${field.name}`;

          if (field.type === "switch") {
            return (
              <Switch
                key={field.name}
                name={field.name}
                id={id}
                label={field.label}
                checked={value === true}
                onChange={(event) => set(field.name, event.target.checked)}
              />
            );
          }

          if (field.type === "map") {
            return (
              <Field
                key={field.name}
                label={field.label}
                hint={field.hint}
                error={
                  errorText ?? (field.lngField ? issueFor(field.lngField) : undefined)
                }
              >
                <MapPicker
                  lat={numberOrNull(value)}
                  lng={numberOrNull(field.lngField ? values[field.lngField] : undefined)}
                  label={field.label}
                  onChange={(point) => {
                    if (point === null) {
                      set(field.name, "");
                      if (field.lngField) set(field.lngField, "");
                      return;
                    }
                    set(field.name, String(point.lat));
                    if (field.lngField) set(field.lngField, String(point.lng));
                  }}
                />
              </Field>
            );
          }

          return (
            <Field
              key={field.name}
              label={field.label}
              htmlFor={id}
              hint={field.hint}
              error={errorText}
              required={field.required}
            >
              {field.type === "textarea" ? (
                <Textarea
                  name={field.name}
                  id={id}
                  rows={field.rows ?? 3}
                  value={String(value)}
                  placeholder={field.placeholder}
                  readOnly={field.readOnly}
                  onChange={(event) => set(field.name, event.target.value)}
                />
              ) : field.type === "select" ? (
                <Select
                  name={field.name}
                  id={id}
                  value={String(value)}
                  onChange={(event) => set(field.name, event.target.value)}
                >
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  name={field.name}
                  id={id}
                  type={
                    field.type === "money"
                      ? "text"
                      : field.type === "date"
                        ? "date"
                        : field.type === "password"
                          ? "password"
                          : field.type === "email"
                            ? "email"
                            : field.type === "number"
                              ? "number"
                              : "text"
                  }
                  // A money field gets a decimal keypad on a phone and the
                  // currency hint, without a locale-formatted number input that
                  // would fight the typed value.
                  inputMode={field.type === "money" ? "decimal" : undefined}
                  value={String(value)}
                  placeholder={field.placeholder}
                  readOnly={field.readOnly}
                  autoComplete={field.type === "password" ? "new-password" : "off"}
                  onChange={(event) => set(field.name, event.target.value)}
                />
              )}
            </Field>
          );
        })}

        <Button type="submit" variant={tone} loading={busy} block>
          {submitLabel}
        </Button>
      </Stack>
    </form>
  );
}
