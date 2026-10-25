import { prisma } from "@kanofood/db";

import { platformPhone as envPhone, platformWhatsApp as envWhatsApp } from "../env";
import { loadPlatformContact } from "../settings/platform";

/**
 * Settings. Screen 7.12.
 *
 * **The table exists now, and only the part that belongs in one is editable.**
 * Phase 5 shipped this screen read only because the schema had nineteen models
 * and none held a platform-level value. `platform_settings` closes that, and the
 * contact numbers are editable through it.
 *
 * What stays read only is not unfinished: it is configuration the running
 * process already read.
 *
 *   1. Branding lives in `.env` (`BRAND_NAME`, `BRAND_TAGLINE`, `BRAND_LOGO_URL`,
 *      `BRAND_FAVICON_URL`, `BRAND_COLOR_PRIMARY`, `BRAND_COLOR_ACCENT`) and is
 *      read at module scope by the root layout, the three shells and the
 *      manifest. A form that wrote a row instead would change a value nothing
 *      reads until the process restarts.
 *   2. Session lifetimes, storage and the notification provider keys are read at
 *      startup, and a key a screen can rewrite is a credential with a form
 *      attached.
 *   3. Confirmation mode, auto-cancel and per-event notification toggles are not
 *      implemented at all. A switch that stores a value nothing consults is
 *      worse than no switch.
 *
 * So the screen shows every value that is actually in effect, says where each one
 * comes from, and edits the two that a customer's ability to order depends on.
 * ===========================================================================
 */

/** Where a displayed value actually comes from. */
export type SettingSource = "environment" | "database" | "code";

export interface SettingRow {
  readonly label: string;
  readonly value: string;
  readonly source: SettingSource;
  readonly note?: string;
}

export interface SettingGroup {
  readonly title: string;
  readonly blurb: string;
  readonly rows: readonly SettingRow[];
}

export interface SettingsView {
  readonly groups: readonly SettingGroup[];
  /**
   * The values an operator can actually change, and what surrounds them.
   *
   * `stored` is what the table holds and is what the form edits. `env` is the
   * fallback and is shown beside it so clearing a field is not a leap of faith:
   * an empty box means "use the host's value", and the host's value is on screen.
   */
  readonly contact: {
    readonly phone: string | null;
    readonly whatsapp: string | null;
    readonly storedPhone: string | null;
    readonly storedWhatsapp: string | null;
    readonly envPhone: string | null;
    readonly envWhatsapp: string | null;
    readonly source: "database" | "environment";
    readonly readFromDatabase: boolean;
  };
  readonly deliveryZones: readonly {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly isActive: boolean;
    readonly isDefault: boolean;
    readonly baseFeeKobo: bigint;
    readonly tiers: number;
    readonly paymentRequirement: string;
  }[];
  readonly defaultZoneSlug: string | null;
  readonly defaultZoneMissing: boolean;
}

/** The same fallbacks the layouts use, so this screen cannot disagree with them. */
function brandName(): string {
  return process.env.BRAND_NAME?.trim() || "KanoFood";
}

function envOr(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? fallback : trimmed;
}

/** A value that is set or not, without ever echoing the value itself. */
function presence(value: string | undefined): string {
  return value?.trim() ? "Set" : "Not set";
}

export async function loadSettings(): Promise<SettingsView> {
  const defaultZoneSlug = process.env.DELIVERY_DEFAULT_ZONE?.trim() || null;

  const [contact, zones] = await Promise.all([
    loadPlatformContact(),
    prisma.deliveryZone.findMany({
      orderBy: [{ priority: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        baseFeeKobo: true,
        paymentRequirement: true,
        _count: { select: { feeRules: true } },
      },
    }),
  ]);

  const deliveryZones = zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    slug: zone.slug,
    isActive: zone.isActive,
    isDefault: defaultZoneSlug !== null && zone.slug === defaultZoneSlug,
    baseFeeKobo: zone.baseFeeKobo,
    tiers: zone._count.feeRules,
    paymentRequirement: zone.paymentRequirement,
  }));

  const groups: SettingGroup[] = [
    {
      title: "Brand",
      blurb: "Read from the environment at startup. A change needs a deploy.",
      rows: [
        { label: "Name", value: brandName(), source: "environment", note: "BRAND_NAME" },
        {
          label: "Tagline",
          value: envOr(process.env.BRAND_TAGLINE, "Food delivery in Kano Metropolitan."),
          source: "environment",
          note: "BRAND_TAGLINE",
        },
        { label: "Logo", value: presence(process.env.BRAND_LOGO_URL), source: "environment", note: "BRAND_LOGO_URL" },
        {
          label: "Favicon",
          value: presence(process.env.BRAND_FAVICON_URL),
          source: "environment",
          note: "BRAND_FAVICON_URL",
        },
        {
          label: "Primary colour",
          value: envOr(process.env.BRAND_COLOR_PRIMARY, "Not set, the default token applies"),
          source: "environment",
          note: "BRAND_COLOR_PRIMARY",
        },
        {
          label: "Accent colour",
          value: envOr(process.env.BRAND_COLOR_ACCENT, "Not set, the default token applies"),
          source: "environment",
          note: "BRAND_COLOR_ACCENT",
        },
      ],
    },
    {
      title: "Order handling",
      blurb: "How an order is confirmed after it is placed.",
      rows: [
        {
          label: "Confirmation mode",
          value: "Manual call",
          source: "code",
          note:
            "The only mode implemented. Every order waits in PENDING_CONFIRMATION until an operator confirms it. PRODUCT_SPEC section 9.",
        },
        {
          label: "Phone confirmation record",
          value: "Required",
          source: "code",
          note:
            "A confirmation cannot be recorded without an order event naming who called, per section 9.",
        },
        {
          label: "Auto-cancel window",
          value: "None",
          source: "code",
          note: "Nothing cancels an unanswered order automatically. An operator decides.",
        },
      ],
    },
    {
      title: "Delivery",
      blurb: "Which zone prices a delivery when the customer's location cannot be resolved.",
      rows: [
        {
          label: "Default zone",
          value: defaultZoneSlug ?? "Not set",
          source: "environment",
          note: defaultZoneSlug
            ? "DELIVERY_DEFAULT_ZONE. Matched against a zone slug below."
            : "DELIVERY_DEFAULT_ZONE. ARCHITECTURE section 11 defines this as a slug, and nothing is set.",
        },
        {
          label: "Fee tiers",
          value: `${deliveryZones.reduce((total, zone) => total + zone.tiers, 0)} across ${deliveryZones.length} zones`,
          source: "database",
          note: "Editable on the Zones screen.",
        },
      ],
    },
    {
      title: "Notifications",
      blurb: "Email and push. Section 8, and Phase 9 of the plan.",
      rows: [
        {
          label: "Email sending",
          value: presence(process.env.EMAIL_PROVIDER_KEY),
          source: "environment",
          note: "EMAIL_PROVIDER_KEY",
        },
        {
          label: "Email from address",
          value: envOr(process.env.EMAIL_FROM, "Not set"),
          source: "environment",
          note: "EMAIL_FROM",
        },
        {
          label: "Web push",
          value: presence(process.env.PUSH_VAPID_PUBLIC_KEY),
          source: "environment",
          note: "PUSH_VAPID_PUBLIC_KEY",
        },
        {
          label: "Order notification toggles",
          value: "Not implemented",
          source: "code",
          note: "Every routed status sends on its channels. There is no per-event switch.",
        },
      ],
    },
    {
      title: "Reporting",
      blurb: "Google Sheets. Reporting only, never the database.",
      rows: [
        {
          label: "Sheets sync",
          value:
            process.env.SHEETS_SYNC_ENABLED?.trim().toLowerCase() === "true" ? "On" : "Off",
          source: "environment",
          note: "SHEETS_SYNC_ENABLED",
        },
        {
          label: "Sheets webhook",
          value: presence(process.env.SHEETS_WEBHOOK_URL),
          source: "environment",
          note: "SHEETS_WEBHOOK_URL. The Apps Script web app's /exec URL.",
        },
        {
          label: "Sheets token",
          value: presence(process.env.SHEETS_WEBHOOK_TOKEN),
          source: "environment",
          note: "SHEETS_WEBHOOK_TOKEN. Must match TOKEN in the deployed script.",
        },
      ],
    },
    {
      title: "Sessions",
      blurb: "How long a signed-in person stays signed in.",
      rows: [
        {
          label: "Staff access token",
          value: envOr(process.env.AUTH_TOKEN_TTL, "15m"),
          source: "environment",
          note: "AUTH_TOKEN_TTL",
        },
        {
          label: "Admin access token",
          value: envOr(process.env.ADMIN_TOKEN_TTL, "5m"),
          source: "environment",
          note:
            "ADMIN_TOKEN_TTL. Shorter on purpose: an admin can cancel a live order, suspend a rider and move money. UX_SPEC section 7.1.",
        },
        {
          label: "Refresh token",
          value: "30 days, rotated on every use",
          source: "code",
          note: "A reused refresh token revokes every session for that account.",
        },
      ],
    },
    {
      title: "Storage",
      blurb: "Kitchen and food images. ARCHITECTURE section 9.",
      rows: [
        {
          label: "Provider",
          value: envOr(process.env.STORAGE_PROVIDER, "supabase"),
          source: "environment",
          note: "STORAGE_PROVIDER",
        },
        {
          label: "Bucket",
          value: "media, public, 5 MB per file",
          source: "code",
          note: "JPEG, PNG and WebP only, checked by magic bytes and re-encoded to WebP.",
        },
      ],
    },
  ];

  return {
    groups,
    contact: {
      phone: contact.phone,
      whatsapp: contact.whatsapp,
      storedPhone: contact.storedPhone,
      storedWhatsapp: contact.storedWhatsapp,
      envPhone: envPhone(),
      envWhatsapp: envWhatsApp(),
      source: contact.source,
      readFromDatabase: contact.readFromDatabase,
    },
    deliveryZones,
    defaultZoneSlug,
    defaultZoneMissing:
      defaultZoneSlug !== null && !deliveryZones.some((zone) => zone.slug === defaultZoneSlug),
  };
}
