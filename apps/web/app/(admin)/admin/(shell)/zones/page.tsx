import type { Metadata } from "next";

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
  SectionHeader,
  Spread,
  Stack,
  Table,
  TableWrap,
  Td,
  Th,
} from "@kanofood/ui";

import { AdminDelete } from "@/app/(admin)/_components/admin-delete";
import { AdminForm } from "@/app/(admin)/_components/admin-form";
import { AdminToggle } from "@/app/(admin)/_components/admin-toggle";
import { requireAdmin } from "@/lib/admin/session";
import { listZones } from "@/lib/admin/zones";

/**
 * Zones and delivery fees. Screen 7.7 in docs/UX_SPEC.md.
 *
 * A zone is an area, a base fee, and a ladder of distance tiers. This screen
 * edits all three, and it is the only screen in the admin interface that can
 * change what a customer is charged.
 *
 * Zones are never deleted. An order records the fee it was charged, but the zone
 * is what explains why, and deleting one takes that explanation with it. A zone
 * that is no longer served is switched off instead.
 *
 * What this screen cannot do is draw the boundary. The polygon is GeoJSON in a
 * column with no editor here, so a zone created from this page starts with an
 * empty one and will not match any address until it is filled in. That gap is
 * reported rather than hidden: the warning below appears on every zone that has
 * never been given a shape.
 */

export const metadata: Metadata = { title: "Zones and fees" };

export const dynamic = "force-dynamic";

const REQUIREMENTS = [
  { value: "cod_allowed", label: "Cash on delivery allowed" },
  { value: "prepaid_required", label: "Payment before dispatch" },
] as const;

export default async function ZonesPage() {
  await requireAdmin();
  const zones = await listZones();

  return (
    <Stack>
      <PageHeader
        title="Zones and fees"
        sub={
          zones.length === 0
            ? "None yet."
            : `${String(zones.length)} zones, ${String(zones.reduce((total, zone) => total + zone.rules.length, 0))} distance tiers.`
        }
      />

      <Alert tone="info">
        Tiers cannot overlap. A distance the platform cannot price is an order it cannot take, and a distance it can
        price two ways is a different price depending on which row was read first, so the overlap is refused rather
        than resolved.
      </Alert>

      <Card>
        <CardHeader title="Add a zone" />
        <CardBody>
          <AdminForm
            action="/api/v1/admin/zones"
            submitLabel="Add zone"
            successMessage="Zone added. It is off until you switch it on."
            fields={[
              { name: "name", label: "Name", type: "text", required: true, placeholder: "Nassarawa" },
              { name: "slug", label: "Short name", type: "text", hint: "Left empty, it is made from the name." },
              { name: "baseFeeNaira", label: "Base fee (naira)", type: "money", required: true, placeholder: "500" },
              {
                name: "paymentRequirement",
                label: "Payment",
                type: "select",
                value: "cod_allowed",
                options: REQUIREMENTS,
                required: true,
              },
              {
                name: "priority",
                label: "Priority",
                type: "number",
                hint: "When two zones both contain an address, the higher priority wins.",
              },
            ]}
          />
        </CardBody>
      </Card>

      {zones.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState title="No zones yet">
              A zone is what makes an address deliverable. Nothing can be ordered until one exists.
            </EmptyState>
          </CardBody>
        </Card>
      ) : (
        zones.map((zone) => (
          <Card key={zone.id}>
            <CardHeader
              title={zone.name}
              action={
                <Cluster>
                  <Badge tone={zone.isActive ? "success" : "neutral"}>
                    {zone.isActive ? "Delivering" : "Switched off"}
                  </Badge>
                  <span className="kf-muted">priority {String(zone.priority)}</span>
                </Cluster>
              }
            />

            <CardBody>
              <Stack>
                <Spread>
                  <Cluster>
                    <span className="kf-muted">Base fee</span>
                    <Money value={formatNaira(zone.baseFeeKobo)} />
                    <span className="kf-muted">
                      {zone.paymentRequirement === "cod_allowed"
                        ? "Cash on delivery allowed"
                        : "Payment before dispatch"}
                    </span>
                  </Cluster>
                  <AdminToggle
                    action={`/api/v1/admin/zones/${zone.id}`}
                    method="PATCH"
                    name="isActive"
                    label="Delivering here"
                    checked={zone.isActive}
                    successMessage={zone.isActive ? "Zone switched off." : "Zone switched on."}
                  />
                </Spread>

                <Alert tone="warning">
                  The boundary is not editable here. A zone with no shape matches no address, so check this one in
                  the database before switching it on.
                </Alert>

                <SectionHeader title="Distance tiers" />
                {zone.rules.length === 0 ? (
                  <p className="kf-muted">
                    No tiers, so only the base fee applies at any distance. Add the first tier below.
                  </p>
                ) : (
                  <TableWrap>
                    <Table>
                      <thead>
                        <tr>
                          <Th>From</Th>
                          <Th>To</Th>
                          <Th numeric>Fee</Th>
                          <Th>Actions</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {zone.rules.map((rule) => (
                          <tr key={rule.id}>
                            <Td label="From">{`${rule.minKm} km`}</Td>
                            <Td label="To">{`${rule.maxKm} km`}</Td>
                            <Td numeric label="Fee">
                              <Money value={formatNaira(rule.feeKobo)} />
                            </Td>
                            <Td label="Actions">
                              <Stack tight>
                                <details>
                                  <summary className="kf-muted">Edit</summary>
                                  <AdminForm
                                    action={`/api/v1/admin/fee-rules/${rule.id}`}
                                    method="PATCH"
                                    submitLabel="Save tier"
                                    successMessage="Tier saved."
                                    fields={[
                                      { name: "minKm", label: "From (km)", type: "text", value: rule.minKm, required: true },
                                      { name: "maxKm", label: "To (km)", type: "text", value: rule.maxKm, required: true },
                                      {
                                        name: "feeNaira",
                                        label: "Fee (naira)",
                                        type: "money",
                                        value: formatNaira(rule.feeKobo),
                                        required: true,
                                      },
                                    ]}
                                  />
                                </details>

                                {/* A tier is a price for a distance, and no order
                                    points at one, so deleting it changes what
                                    future orders cost and nothing about past
                                    ones. The last tier is refused by the
                                    service. */}
                                <AdminDelete
                                  action={`/api/v1/admin/fee-rules/${rule.id}`}
                                  what={`the ${rule.minKm}-${rule.maxKm} km tier`}
                                  label="Remove"
                                  warning="Orders already placed keep the fee they were charged. Only future orders change."
                                />
                              </Stack>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableWrap>
                )}

                <AdminForm
                  action={`/api/v1/admin/zones/${zone.id}/rules`}
                  submitLabel="Add tier"
                  successMessage="Tier added."
                  fields={[
                    {
                      name: "minKm",
                      label: "From (km)",
                      type: "text",
                      required: true,
                      placeholder: "0",
                      hint: "The lower edge is included.",
                    },
                    { name: "maxKm", label: "To (km)", type: "text", required: true, placeholder: "3" },
                    { name: "feeNaira", label: "Fee (naira)", type: "money", required: true, placeholder: "700" },
                  ]}
                />

                <details>
                  <summary className="kf-muted">Edit the zone itself</summary>
                  <AdminForm
                    action={`/api/v1/admin/zones/${zone.id}`}
                    method="PATCH"
                    submitLabel="Save zone"
                    successMessage="Zone saved."
                    fields={[
                      { name: "name", label: "Name", type: "text", value: zone.name },
                      {
                        name: "baseFeeNaira",
                        label: "Base fee (naira)",
                        type: "money",
                        value: formatNaira(zone.baseFeeKobo),
                      },
                      {
                        name: "paymentRequirement",
                        label: "Payment",
                        type: "select",
                        value: zone.paymentRequirement,
                        options: REQUIREMENTS,
                      },
                      { name: "priority", label: "Priority", type: "number", value: zone.priority },
                      {
                        name: "slug",
                        label: "Short name",
                        type: "text",
                        value: zone.slug,
                        readOnly: true,
                        hint: "Fixed. It is what configuration points at.",
                      },
                    ]}
                  />
                </details>
              </Stack>
            </CardBody>
          </Card>
        ))
      )}
    </Stack>
  );
}
