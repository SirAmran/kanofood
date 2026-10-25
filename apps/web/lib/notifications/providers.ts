import type { NotificationChannel } from "@kanofood/core";

import { emailProvider } from "./email";
import { pushProvider } from "./push";

/**
 * One channel's way of sending. docs/ARCHITECTURE.md section 8: "one interface,
 * several providers, chosen per event and per role".
 *
 * A provider is only ever handed a row that already exists, because the row is
 * the record of the attempt rather than a side effect of it. That ordering is
 * what makes a notification that never left the building visible.
 *
 * Three of the five channels have a provider. `sms` and `whatsapp` do not, and a
 * channel with no entry is recorded as `skipped` with a reason, which is why the
 * registry is allowed to stay partial rather than being filled with stubs that
 * pretend to send.
 */

export interface OutgoingNotification {
  /** The row that was just written. A provider may store it as its reference. */
  readonly id: string;
  readonly channel: NotificationChannel;
  readonly title: string;
  readonly body: string;
  /** Exactly one of these is set, matching the row. */
  readonly userId: string | null;
  readonly customerId: string | null;
  /**
   * Where this channel would send, when the channel has an address at all.
   *
   * Email needs it and Web Push does not: a push subscription is looked up by
   * the target id, so the provider owns that lookup. Resolved by the dispatcher
   * alongside the target rather than queried again inside the provider, so one
   * order move costs one read per person instead of one per channel.
   */
  readonly address: string | null;
}

export interface ProviderResult {
  /** Whatever the provider calls the message. Null when it has no identifier. */
  readonly providerRef?: string | null;
  /**
   * Why this message was not sent, when the provider chose not to send it.
   *
   * Distinct from throwing, and the distinction is the point. A rider with no
   * email on file is not a broken channel: it is one message that had nowhere to
   * go, and marking it `failed` would put a permanent red mark on the admin's
   * view for a normal fact about a person. The row is `skipped` and the reason is
   * written into it.
   */
  readonly skippedReason?: string;
}

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  /**
   * Whether this channel can send at all, judged from the environment.
   *
   * Separate from `send` throwing because the two mean different things to the
   * person reading the admin's failure view: a missing key is a configuration
   * gap that affects every message of that channel, and a failed send is one
   * message that went wrong.
   */
  isConfigured(): boolean;
  /** Only read when `isConfigured` is false, and written to the row's `error`. */
  unconfiguredReason(): string;
  send(message: OutgoingNotification): Promise<ProviderResult>;
}

/**
 * In-app is free, always configured, and has nothing to deliver.
 *
 * The row written by the dispatcher *is* the message: the bell reads rows. So
 * "sending" means the row exists and is visible, which is why this provider has
 * no environment check and no failure path.
 */
const inAppProvider: NotificationProvider = {
  channel: "in_app",
  isConfigured: () => true,
  unconfiguredReason: () => "",
  async send() {
    return {};
  },
};

export const PROVIDERS: Readonly<
  Partial<Record<NotificationChannel, NotificationProvider>>
> = {
  in_app: inAppProvider,
  email: emailProvider,
  push: pushProvider,
};

export function providerFor(channel: NotificationChannel): NotificationProvider | null {
  return PROVIDERS[channel] ?? null;
}
