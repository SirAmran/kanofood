import type { Metadata } from "next";
import Link from "next/link";

import { formatNaira } from "@kanofood/core";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Cluster,
  EmptyState,
  Money,
  PageHeader,
  Stack,
  Table,
  TableWrap,
  Td,
  Th,
  type Tone,
} from "@kanofood/ui";

import { requireAdmin } from "@/lib/admin/session";
import { loadSettings } from "@/lib/admin/settings";

/**
 * Settings. Screen 7.12 in docs/UX_SPEC.md.
 *
 * **Read-only, and that is a decision rather than an unfinished screen.**
 *
 * Three things block an editable version. There is no settings table: the schema
 * has nineteen models and not one of them holds a platform-level value. `.env` is
 * not writable at runtime, and even if it were, editing it would change what the
 * next process reads and not what this one is running. And there is no platform
 * phone number anywhere in the repository to edit.
 *
 * Writing any of those would mean either migrating the live database or storing
 * a value in a place that lies about where it came from. So this screen shows the
 * values actually in effect, says where each one comes from, and puts the
 * editable version where it belongs: a settings table, in a phase that can
 * migrate the database deliberately.
 *
 * What it is genuinely useful for today is answering "what is this deployment
 * actually configured to do", which is otherwise a question about environment
 * variables nobody can see from the interface.
 */

export const metadata: Metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

/** Where a value came from, as a word and a colour. */
const SOURCES: Readonly<Record<string, { label: string; tone: Tone }>> = {
  environment: { label: "Environment", tone: "accent" },
  database: { label: "Database", tone: "success" },
  code: { label: "In code", tone: "neutral" },
};

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await loadSettings();

  const missing = settings.groups
    .flatMap((group) => group.rows)
    .filter((row) => row.source === "environment" && row.value === "Not set");

  return (
    <Stack>
      <PageHeader title="Settings" sub="What this deployment is configured to do." />

      <Alert tone="info">
        Read only. These values come from the environment this process started with and from the database, so an
        editable form here would either lie about where a value lives or change it somewhere nothing else can see.
        An editable screen needs a settings table, which does not exist yet.
      </Alert>

      {missing.length > 0 ? (
        <Alert tone="warning">
          {String(missing.length)} settings are not set and the platform is running on the fallbacks shown below.
          That is not necessarily wrong, but it should be deliberate.
        </Alert>
      ) : null}

      {settings.groups.map((group) => (
        <Card key={group.title}>
          <CardHeader title={group.title} />
          <CardBody>
            <Stack>
              <p className="kf-muted">{group.blurb}</p>
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Setting</Th>
                      <Th>Value</Th>
                      <Th>From</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => {
                      const source = SOURCES[row.source] ?? SOURCES.code;
                      return (
                        <tr key={row.label}>
                          <Td label="Setting">
                            {row.label}
                            {row.note ? <div className="kf-muted">{row.note}</div> : null}
                          </Td>
                          <Td label="Value">{row.value}</Td>
                          <Td label="From">
                            <Badge tone={source?.tone ?? "neutral"}>{source?.label ?? row.source}</Badge>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            </Stack>
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardHeader
          title="Delivery zones"
          action={
            settings.defaultZoneSlug ? (
              <Cluster>
                <span className="kf-muted">Default</span>
                <Badge tone="accent">{settings.defaultZoneSlug}</Badge>
              </Cluster>
            ) : null
          }
        />
        {settings.deliveryZones.length === 0 ? (
          <CardBody>
            <EmptyState title="No zones configured">
              Nothing is deliverable yet. A zone is what makes an address orderable.
            </EmptyState>
          </CardBody>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Zone</Th>
                  <Th>Short name</Th>
                  <Th>State</Th>
                  <Th>Payment</Th>
                  <Th numeric>Base fee</Th>
                  <Th numeric>Tiers</Th>
                </tr>
              </thead>
              <tbody>
                {settings.deliveryZones.map((zone) => (
                  <tr key={zone.id}>
                    <Td label="Zone">
                      {zone.name}
                      {zone.isDefault ? (
                        <div className="kf-muted">The zone this deployment defaults to.</div>
                      ) : null}
                    </Td>
                    <Td label="Short name">
                      <span className="kf-muted">{zone.slug}</span>
                    </Td>
                    <Td label="State">
                      <Badge tone={zone.isActive ? "success" : "neutral"}>
                        {zone.isActive ? "Delivering" : "Off"}
                      </Badge>
                    </Td>
                    <Td label="Payment">
                      {zone.paymentRequirement === "cod_allowed"
                        ? "Cash on delivery allowed"
                        : "Payment before dispatch"}
                    </Td>
                    <Td numeric label="Base fee">
                      <Money value={formatNaira(zone.baseFeeKobo)} />
                    </Td>
                    <Td numeric label="Tiers">
                      {String(zone.tiers)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
        <CardBody>
          <Cluster>
            <Link href="/admin/zones">Edit zones and fees</Link>
            {settings.defaultZoneMissing ? (
              <span className="kf-muted">
                The configured default zone <code>{settings.defaultZoneSlug}</code> does not exist in the database.
              </span>
            ) : null}
            {settings.defaultZoneSlug === null ? (
              <span className="kf-muted">No default zone is configured.</span>
            ) : null}
          </Cluster>
        </CardBody>
      </Card>
    </Stack>
  );
}
