import { emailFrom, resendApiKey } from "../env";

import type { NotificationProvider, OutgoingNotification, ProviderResult } from "./providers";

/**
 * Email, through Resend. docs/ARCHITECTURE.md section 8 calls it the audit
 * channel and the reliable fallback, which is a description of who it is for:
 * an admin watching for orders, a kitchen mid-service, a rider on the move.
 *
 * **Email is internal only, and that is a rule rather than a habit.** A customer
 * is never mailed, on any status. The customer record in this schema has no
 * email field at all (section 7: no customer accounts in V1), and the routing
 * table in `@kanofood/core` carries no customer email route, with a test holding
 * it there. So an address always comes from `users.email`, and a message that
 * reaches `send` with no address is a person without one on file, never a
 * customer who should have been reachable.
 *
 * Done against the HTTP API rather than the `resend` package. The whole job is
 * one POST with a bearer token and a JSON body, so a dependency in the lockfile
 * would buy nothing and would have to be kept current. The push provider next
 * to this one is built the same way, by hand, for the same reason.
 *
 * Both variables are empty in this repository on purpose: the provider is inert
 * rather than disabled, so a deployment without keys records each email as
 * `skipped` with the reason instead of failing an order or a build. **Nothing
 * here has been exercised against a live key**, because there is not one on this
 * machine.
 */

const ENDPOINT = "https://api.resend.com/emails";

/** Resend answers long before this; the limit is here so a hung socket cannot hold a row open. */
const TIMEOUT_MS = 10_000;

/** How much of Resend's own explanation is kept in the row an operator reads. */
const DETAIL_LIMIT = 200;

/**
 * The variables that are absent, by their configured names.
 *
 * Read from `env.ts` rather than `process.env` so there is one place that
 * decides what "set" means: a variable holding only spaces is missing, which is
 * the failure a `.env` file produces when somebody leaves a value blank.
 */
function missingVariables(): string[] {
  const missing: string[] = [];
  if (resendApiKey() === null) missing.push("EMAIL_PROVIDER_KEY");
  if (emailFrom() === null) missing.push("EMAIL_FROM");
  return missing;
}

/**
 * Why email cannot send, in words that name the fix.
 *
 * The names are the environment's names, not Resend's, because the person
 * reading this row is looking at a deployment's configuration and not at the
 * provider's dashboard.
 */
function unconfiguredReason(): string {
  const missing = missingVariables();
  if (missing.length === 0) return "Email is configured.";

  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(", ")} and ${String(missing[missing.length - 1])}`;

  return `Email is not configured: ${list} ${missing.length === 1 ? "is" : "are"} not set.`;
}

/**
 * Resend's own words for a refusal, since that is what says whether the sender
 * domain is unverified, the key is wrong or the address was rejected.
 *
 * Their errors are JSON (`{"statusCode":422,"message":"..."}`), but a proxy in
 * front of them can answer with HTML, so the raw text is the fallback rather
 * than an empty string.
 */
function resendDetail(raw: string): string {
  const text = raw.trim();
  if (text === "") return "";

  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && "message" in parsed) {
      const message = (parsed as { message?: unknown }).message;
      if (typeof message === "string" && message.trim() !== "") {
        return message.trim().slice(0, DETAIL_LIMIT);
      }
    }
  } catch {
    // Not JSON. The text is still the most useful thing available.
  }

  return text.slice(0, DETAIL_LIMIT);
}

export const emailProvider: NotificationProvider = {
  channel: "email",

  isConfigured: () => {
    return resendApiKey() !== null && emailFrom() !== null;
  },

  unconfiguredReason,

  async send(message: OutgoingNotification): Promise<ProviderResult> {
    /**
     * A guard rather than a skip. The dispatcher checks the address before it
     * calls this provider, so reaching here without one means a caller went
     * around that check, and silently skipping would hide the bug behind a row
     * that looks like a normal fact about a person.
     */
    if (message.address === null || message.address.trim() === "") {
      throw new Error(
        `Notification ${message.id} has no email address to send to. The dispatcher ` +
          "must record this as skipped rather than calling the email provider.",
      );
    }

    const apiKey = resendApiKey();
    const from = emailFrom();
    // Belt and braces: `isConfigured` has already answered, but `send` must not
    // put "Bearer null" on the wire if a caller forgot to ask first.
    if (apiKey === null || from === null) throw new Error(unconfiguredReason());

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        // `text` rather than `html`: these are two short sentences for a person
        // at work, and a plain body cannot carry a tracker or a broken layout.
        body: JSON.stringify({
          from,
          to: [message.address],
          subject: message.title,
          text: message.body,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      // A timeout or a dead network arrives as an `AbortError` whose message says
      // nothing about email, so it is renamed here before it reaches the row.
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Resend could not be reached: ${detail}.`);
    }

    if (!response.ok) {
      const detail = resendDetail(await response.text().catch(() => ""));
      throw new Error(
        `Resend answered ${String(response.status)}${detail === "" ? "." : `: ${detail}`}`,
      );
    }

    /**
     * The id is stored as the row's `provider_ref`, which is the only handle
     * Resend's dashboard and a support question share. A success with an
     * unreadable body is still a success, so it is recorded without a reference
     * rather than thrown away.
     */
    let providerRef: string | null = null;
    try {
      const parsed: unknown = JSON.parse(await response.text());
      if (typeof parsed === "object" && parsed !== null && "id" in parsed) {
        const id = (parsed as { id?: unknown }).id;
        if (typeof id === "string" && id.trim() !== "") providerRef = id.trim();
      }
    } catch {
      // Sent all the same. Nothing to report beyond the missing reference.
    }

    return { providerRef };
  },
};
