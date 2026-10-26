import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  Cluster,
  Media,
  PageHeader,
  Stack,
  Table,
  TableWrap,
  Td,
  Th,
} from "@kanofood/ui";

import { AdminForm } from "@/app/(admin)/_components/admin-form";
import { AdminToggle } from "@/app/(admin)/_components/admin-toggle";
import { AdminUpload } from "@/app/(admin)/_components/admin-upload";
import { loadKitchenSettings } from "@/lib/kitchen/settings";
import { requireKitchen } from "@/lib/kitchen/session";

/**
 * The kitchen's own settings. Screen 5.7 in docs/UX_SPEC.md.
 *
 * Three things a kitchen controls: whether it is trading, what customers read
 * about it, and its photographs. Two things it does not: its address on the site
 * (the slug) and its commission, both of which are the platform's commercial
 * arrangement. Those are shown as facts, not offered as fields, so nobody spends
 * time looking for an input that will never exist.
 *
 * Opening and closing is a switch, not a form: it is the one change that happens
 * at the boundary of service, when nobody wants to scroll to a Save button.
 */

export const metadata: Metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

export default async function KitchenSettingsPage() {
  const actor = await requireKitchen();
  const kitchen = await loadKitchenSettings(actor.kitchenId);
  if (!kitchen) notFound();

  return (
    <Stack>
      <PageHeader title="Settings" sub={`${kitchen.name} · ${kitchen.slug}`} />

      {!kitchen.isActive ? (
        <Alert tone="danger">
          This kitchen is suspended. The profile can be read, but nothing can be saved and the
          kitchen will not accept orders until the platform reactivates it.
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Trading" />
        <CardBody>
          <Stack>
            <AdminToggle
              action="/api/v1/kitchen/open"
              name="isOpen"
              label={kitchen.isOpen ? "Open for orders" : "Closed"}
              checked={kitchen.isOpen}
              successMessage={kitchen.isOpen ? "Kitchen opened." : "Kitchen closed."}
            />
            <p className="kf-muted">
              Closing stops new orders from being placed here. Orders already accepted still run
              their course, and anything waiting has to be accepted or rejected.
            </p>
          </Stack>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Photographs" />
        <CardBody>
          <Cluster>
            <Stack tight>
              <Media
                src={kitchen.logoUrl}
                alt={`${kitchen.name} logo`}
                shape="square"
                fallback={<img src="/images/kitchen-placeholder.svg" alt="" />}
              />
              <AdminUpload
                endpoint="/api/v1/kitchen/uploads"
                purpose="kitchen-logo"
                label="Upload logo"
                successMessage="Logo updated."
              />
            </Stack>
            <Stack tight>
              <Media
                src={kitchen.coverUrl}
                alt={`${kitchen.name} cover`}
                shape="wide"
                fallback={<img src="/images/kitchen-placeholder.svg" alt="" />}
              />
              <AdminUpload
                endpoint="/api/v1/kitchen/uploads"
                purpose="kitchen-cover"
                label="Upload cover photo"
                successMessage="Cover photo updated."
              />
            </Stack>
          </Cluster>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Profile" />
        <CardBody>
          <AdminForm
            action="/api/v1/kitchen/settings"
            method="PATCH"
            submitLabel="Save settings"
            successMessage="Settings saved."
            fields={[
              { name: "name", label: "Kitchen name", type: "text", value: kitchen.name, required: true },
              {
                name: "description",
                label: "About the kitchen",
                type: "textarea",
                rows: 4,
                value: kitchen.description ?? "",
                hint: "Shown on the kitchen's storefront page.",
              },
              { name: "phone", label: "Phone", type: "text", value: kitchen.phone ?? "" },
              {
                name: "addressText",
                label: "Address",
                type: "text",
                value: kitchen.addressText ?? "",
                hint: "Where riders collect from.",
              },
              { name: "landmark", label: "Landmark", type: "text", value: kitchen.landmark ?? "" },
              {
                name: "prepTimeMinutes",
                label: "Typical preparation time (minutes)",
                type: "number",
                value: kitchen.prepTimeMinutes ?? "",
                hint: "Used to tell customers roughly when to expect their food.",
              },
              {
                name: "lat",
                label: "Where riders collect",
                type: "map",
                value: kitchen.lat ?? "",
                lngField: "lng",
                lngValue: kitchen.lng ?? "",
                hint: "The pin is what the platform prices delivery from. Clear both to say the position is unknown.",
              },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Staff" />
        <CardBody flush>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Role</Th>
                </tr>
              </thead>
              <tbody>
                {kitchen.staff.map((member) => (
                  <tr key={member.id}>
                    <Td label="Name">{member.name}</Td>
                    <Td label="Role">{member.role === "owner" ? "Owner" : "Staff"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </CardBody>
        <CardBody>
          <p className="kf-muted">
            Logins are added and removed by the platform. Ask for a change rather than sharing one
            login between people: every accept and reject is recorded against whoever was signed in.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Not yours to change" />
        <CardBody>
          <p className="kf-muted">
            Your page address is <strong>{kitchen.slug}</strong> and your commission rate is set by
            the platform. Both are carried in links and settlement statements, so changing either
            here would silently break them. Ask the platform instead.
          </p>
        </CardBody>
      </Card>
    </Stack>
  );
}
