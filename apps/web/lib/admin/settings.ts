import { prisma } from "@kanofood/db";

/**
 * Settings. Screen 7.12.
 *
 * **This screen reads. It does not write, and that is a gap rather than a
 * decision.** Section 7.12 asks for editable delivery zone defaults, order
 * confirmation mode, notification toggles, a platform phone number and
 * branding. Three things stand in the way of that as written:
 *
 *   1. **There is no settings table.** The schema has nineteen models and none of
 *      them holds a platform-level setting. Branding currently lives in `.env`
 *      (`BRAND_NAME`, `BRAND_TAGLINE`, `BRAND_LOGO_URL`, `BRAND_FAVICON_URL`,
 *      `BRAND_COLOR_PRIMARY`, `BRAND_COLOR_ACCENT`), read at module scope in the
 *      root layout and the admin shell.
 *   2. **`.env` is not writable at runtime**, and should not be: a screen that
 *      rewrites the process environment is a screen that appears to work and
 *      reverts on the next deploy, which is worse than one that says it cannot.
 *   3. **There is no platform phone number anywhere**, in the schema or in the
 *      environment. Giving it one is a product decision about where it is shown,
 *      not a form field.
 *
 * So this screen shows every value that is actually in effect and where each one
 * comes from, which is the half of 7.12 that can be built honestly today. Making
 * it editable needs a `PlatformSetting` table and a migration against the live
 * database, and that is the project owner's call rather than a side effect of
 * building a screen. It is reported with the other spec gaps.
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

  const zones = await prisma.deliveryZone.findMany({
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
  });

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
          note: "Section 8 is Phase 9. There is nothing to toggle yet.",
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
          label: "Sheets target",
          value: presence(process.env.SHEETS_SYNC_TARGET_ID),
          source: "environment",
          note: "SHEETS_SYNC_TARGET_ID",
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
    deliveryZones,
    defaultZoneSlug,
    defaultZoneMissing:
      defaultZoneSlug !== null && !deliveryZones.some((zone) => zone.slug === defaultZoneSlug),
  };
}
