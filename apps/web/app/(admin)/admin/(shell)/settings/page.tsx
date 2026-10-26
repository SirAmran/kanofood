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

import { AdminForm } from "@/app/(admin)/_components/admin-form";
import { requireAdmin } from "@/lib/admin/session";
import { loadSettings } from "@/lib/admin/settings";

/**
 * Settings. Screen 7.12 in docs/UX_SPEC.md.
 *
 * **Editable where a table exists, read only where the process already read the
 * value.** The contact numbers are operator settings now, stored in
 * `platform_settings` and read on a request path. Branding, session lifetimes,
 * storage and the notification keys are read at startup by process-level code,
 * so writing them to a row would change a value nothing reads until the next
 * restart, which is the version of this screen that lies.
 *
 * The rest of the page is the honest half and stays useful: it answers "what is
 * this deployment actually configured to do", which is otherwise a question about
 * environment variables nobody can see from the interface.
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
        The contact numbers below are the only settings an operator changes here. Everything else on this
        page is read from the environment this process started with, or is fixed in the code, so it is
        shown rather than offered as a form: writing it to a table would change a value nothing reads
        until the next restart.
      </Alert>

      {!settings.contact.readFromDatabase ? (
        <Alert tone="warning">
          The settings table could not be read, so the numbers below are the host's environment values.
          Saving will try the table again.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Public contact numbers"
          action={
            <Badge tone={settings.contact.source === "database" ? "success" : "accent"}>
              {settings.contact.source === "database" ? "Database" : "Environment"}
            </Badge>
          }
        />
        <CardBody>
          <Stack>
            <p className="kf-muted">
              Printed on the storefront, the delivery location screen, checkout, tracking and help.
              Confirmation is a phone call, so a customer who cannot reach these cannot order.
            </p>

            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Channel</Th>
                    <Th>In effect</Th>
                    <Th>From</Th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <Td label="Channel">Phone</Td>
                    <Td label="In effect">
                      {settings.contact.phone ?? <span className="kf-muted">Not published</span>}
                    </Td>
                    <Td label="From">
                      <Badge tone={settings.contact.storedPhone ? "success" : "accent"}>
                        {settings.contact.storedPhone ? "Settings table" : "Environment"}
                      </Badge>
                    </Td>
                  </tr>
                  <tr>
                    <Td label="Channel">WhatsApp</Td>
                    <Td label="In effect">
                      {settings.contact.whatsapp ?? <span className="kf-muted">Not published</span>}
                    </Td>
                    <Td label="From">
                      <Badge tone={settings.contact.storedWhatsapp ? "success" : "accent"}>
                        {settings.contact.storedWhatsapp ? "Settings table" : "Environment"}
                      </Badge>
                    </Td>
                  </tr>
                </tbody>
              </Table>
            </TableWrap>

            <AdminForm
              action="/api/v1/admin/settings"
              method="PATCH"
              submitLabel="Save contact numbers"
              successMessage="Contact numbers saved."
              fields={[
                {
                  name: "platformPhone",
                  label: "Platform phone",
                  type: "text",
                  value: settings.contact.storedPhone ?? "",
                  sendEmpty: true,
                  placeholder: "+234 800 000 0000",
                  hint: settings.contact.envPhone
                    ? `Leave it empty to use the host value, ${settings.contact.envPhone}.`
                    : "Leave it empty to hide the phone line. Nothing is configured on the host either.",
                },
                {
                  name: "platformWhatsapp",
                  label: "WhatsApp number",
                  type: "text",
                  value: settings.contact.storedWhatsapp ?? "",
                  sendEmpty: true,
                  placeholder: "+234 800 000 0000",
                  hint: settings.contact.envWhatsapp
                    ? `Leave it empty to use the host value, ${settings.contact.envWhatsapp}.`
                    : "Leave it empty to hide the WhatsApp line.",
                },
              ]}
            />
          </Stack>
        </CardBody>
      </Card>

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
