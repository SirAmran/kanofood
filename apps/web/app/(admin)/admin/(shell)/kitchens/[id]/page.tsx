import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatNaira } from "@kanofood/core";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Cluster,
  EmptyState,
  Grid,
  Media,
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
import { AdminUpload } from "@/app/(admin)/_components/admin-upload";
import { loadKitchen } from "@/lib/admin/kitchens";
import { requireAdmin } from "@/lib/admin/session";

/**
 * One kitchen. Screen 7.6 in docs/UX_SPEC.md.
 *
 * Everything about a single kitchen on one page, because an operator setting one
 * up does all of it in one sitting: the profile, the two images, the commission,
 * the menu and the logins. Splitting these across tabs would mean a screen whose
 * sections cannot see each other, and the menu editor already needs the
 * commission figure beside it to be worth reading.
 *
 * Every control here writes on its own. There is no page-level Save, and there
 * is deliberately no way to change the slug: it is what shared links and
 * `DELIVERY_DEFAULT_ZONE`-style configuration point at.
 */

export const metadata: Metadata = { title: "Kitchen" };

export const dynamic = "force-dynamic";

export default async function KitchenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const { id } = await params;
  const kitchen = await loadKitchen(id);
  if (!kitchen) notFound();

  const categoryOptions = kitchen.categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));

  const itemCount = kitchen.categories.reduce((total, category) => total + category.items.length, 0);

  return (
    <Stack>
      <PageHeader
        title={kitchen.name}
        sub={
          <Cluster>
            <span className="kf-muted">/{kitchen.slug}</span>
            {kitchen.addressText ? <span className="kf-muted">{kitchen.addressText}</span> : null}
            <Link href="/admin/kitchens">All kitchens</Link>
          </Cluster>
        }
        action={
          <Cluster>
            {kitchen.isActive ? (
              <Badge tone={kitchen.isOpen ? "success" : "neutral"}>
                {kitchen.isOpen ? "Open" : "Closed"}
              </Badge>
            ) : (
              <Badge tone="danger">Suspended</Badge>
            )}
          </Cluster>
        }
      />

      <Grid>
        <Card>
          <CardHeader title="Trading today" />
          <CardBody>
            <Stack>
              <Cluster>
                <Money value={formatNaira(kitchen.salesTodayKobo)} />
                <span className="kf-muted">
                  {String(kitchen.ordersToday)} orders placed, {String(kitchen.liveOrders)} still running
                </span>
              </Cluster>

              <AdminToggle
                action={`/api/v1/admin/kitchens/${kitchen.id}/open`}
                name="isOpen"
                label="Open for orders"
                checked={kitchen.isOpen}
                successMessage={kitchen.isOpen ? "Kitchen closed." : "Kitchen opened."}
              />

              {/* Suspending is the heavier switch and the label says what it does,
                  because the difference between "closed" and "suspended" is the
                  difference between tonight and the relationship. */}
              <AdminToggle
                action={`/api/v1/admin/kitchens/${kitchen.id}/active`}
                name="isActive"
                label="Trading on the platform"
                checked={kitchen.isActive}
                successMessage={kitchen.isActive ? "Kitchen suspended." : "Kitchen reinstated."}
              />
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Commission" />
          <CardBody>
            <Stack>
              {kitchen.commissionKoboOn100k === null ? (
                <Alert tone="info">
                  No rate of its own, so the platform default applies. Set one here to override it for this
                  kitchen alone.
                </Alert>
              ) : (
                <Alert tone="info">
                  {formatNaira(kitchen.commissionKoboOn100k)} on every {formatNaira(100_000_00n)} of food sold.
                </Alert>
              )}

              <AdminForm
                action={`/api/v1/admin/kitchens/${kitchen.id}/commission`}
                submitLabel="Set commission"
                successMessage="Commission updated. It applies to orders placed from now on."
                fields={[
                  {
                    name: "rate",
                    label: "Rate (per cent)",
                    type: "text",
                    value: kitchen.commissionRate ?? "",
                    placeholder: "7.5",
                    // Required so an empty box is sent as an empty string, which
                    // is the API's way of saying "back to the platform default".
                    // A rate of zero and no rate at all are different answers.
                    required: true,
                    hint: "Up to four decimal places. Leave it empty to use the platform default.",
                  },
                ]}
              />
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Card>
        <CardHeader title="Images" />
        <CardBody>
          <Grid>
            <Stack>
              <Media src={kitchen.logoUrl} alt={`${kitchen.name} logo`} shape="square" fallback={<span className="kf-muted">No logo</span>} />
              <AdminUpload purpose="kitchen-logo" ownerId={kitchen.id} label="Upload a logo" successMessage="Logo updated." />
            </Stack>
            <Stack>
              <Media src={kitchen.coverUrl} alt={`${kitchen.name} cover`} shape="wide" fallback={<span className="kf-muted">No cover</span>} />
              <AdminUpload purpose="kitchen-cover" ownerId={kitchen.id} label="Upload a cover" successMessage="Cover updated." />
            </Stack>
          </Grid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Profile" />
        <CardBody>
          <AdminForm
            action={`/api/v1/admin/kitchens/${kitchen.id}`}
            method="PATCH"
            submitLabel="Save profile"
            successMessage="Profile saved."
            fields={[
              { name: "name", label: "Name", type: "text", value: kitchen.name, required: true },
              { name: "phone", label: "Phone", type: "text", value: kitchen.phone ?? "" },
              { name: "addressText", label: "Address", type: "text", value: kitchen.addressText ?? "" },
              { name: "landmark", label: "Landmark", type: "text", value: kitchen.landmark ?? "" },
              {
                name: "prepTimeMinutes",
                label: "Preparation time (minutes)",
                type: "number",
                value: kitchen.prepTimeMinutes,
              },
              {
                name: "lat",
                label: "Location",
                type: "map",
                value: kitchen.lat,
                lngField: "lng",
                lngValue: kitchen.lng,
                hint: "Every delivery fee is measured from this pin, so a kitchen without one can only be priced at its zone's flat fee. Clear both to say the position is unknown.",
              },
              { name: "description", label: "Description", type: "textarea", rows: 4, value: kitchen.description ?? "" },
              {
                name: "slug",
                label: "Address",
                type: "text",
                value: `/${kitchen.slug}`,
                readOnly: true,
                hint: "Fixed. Links already shared point at it.",
              },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Menu"
          action={<span className="kf-muted">{`${String(kitchen.categories.length)} sections, ${String(itemCount)} dishes`}</span>}
        />

        {kitchen.categories.length === 0 ? (
          <CardBody>
            <EmptyState title="No menu yet">
              A kitchen needs at least one section before it can hold a dish. Add the first one below, then add
              dishes to it.
            </EmptyState>
          </CardBody>
        ) : (
          kitchen.categories.map((category) => (
            <CardBody key={category.id}>
              <Stack>
                <Spread>
                  <SectionHeader title={category.name} />
                  <AdminToggle
                    action={`/api/v1/admin/menu/categories/${category.id}/availability`}
                    name="isActive"
                    label="Showing"
                    checked={category.isActive}
                    successMessage={category.isActive ? "Section hidden." : "Section showing."}
                  />
                </Spread>

                {category.items.length === 0 ? (
                  <p className="kf-muted">Nothing in this section yet.</p>
                ) : (
                  <TableWrap>
                    <Table>
                      <thead>
                        <tr>
                          <Th>Dish</Th>
                          <Th numeric>Price</Th>
                          <Th>Available</Th>
                          <Th>Actions</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {category.items.map((item) => (
                          <tr key={item.id}>
                            <Td label="Dish">
                              <Cluster>
                                <Media src={item.imageUrl} alt={item.name} shape="thumb" />
                                <span>
                                  {item.name}
                                  {item.description ? <div className="kf-muted">{item.description}</div> : null}
                                </span>
                              </Cluster>
                            </Td>
                            <Td numeric label="Price">
                              <Money value={formatNaira(item.priceKobo)} />
                            </Td>
                            <Td label="Available">
                              <AdminToggle
                                action={`/api/v1/admin/menu/items/${item.id}/availability`}
                                name="isAvailable"
                                label={item.isAvailable ? "Available" : "Sold out"}
                                checked={item.isAvailable}
                                successMessage={item.isAvailable ? "Marked sold out." : "Back on the menu."}
                              />
                            </Td>
                            <Td label="Actions">
                              <Stack tight>
                                <details>
                                  <summary className="kf-muted">Edit</summary>
                                  <AdminForm
                                    action={`/api/v1/admin/menu/items/${item.id}`}
                                    method="PATCH"
                                    submitLabel="Save dish"
                                    successMessage="Dish saved."
                                    fields={[
                                      {
                                        name: "categoryId",
                                        label: "Section",
                                        type: "select",
                                        value: category.id,
                                        options: categoryOptions,
                                      },
                                      { name: "name", label: "Name", type: "text", value: item.name, required: true },
                                      {
                                        name: "priceNaira",
                                        label: "Price (naira)",
                                        type: "money",
                                        // The formatted figure goes straight back
                                        // in: `parseNairaToKobo` reads a leading
                                        // naira sign and thousands separators, so
                                        // there is no second way to write an
                                        // amount into an input in this codebase.
                                        value: formatNaira(item.priceKobo),
                                        required: true,
                                      },
                                      {
                                        name: "description",
                                        label: "Description",
                                        type: "textarea",
                                        rows: 3,
                                        value: item.description ?? "",
                                      },
                                      { name: "sortOrder", label: "Order in section", type: "number", value: item.sortOrder },
                                      {
                                        name: "isAvailable",
                                        label: "Available",
                                        type: "switch",
                                        value: item.isAvailable,
                                      },
                                    ]}
                                  />
                                  <AdminUpload
                                    purpose="menu-item"
                                    ownerId={item.id}
                                    label="Replace photo"
                                    successMessage="Photo updated."
                                  />
                                </details>

                                {/* A dish that has ever been ordered is not deleted
                                    by the service, it is hidden, so the dialog
                                    says "remove" rather than promising more than
                                    it can. */}
                                <AdminDelete
                                  action={`/api/v1/admin/menu/items/${item.id}`}
                                  what={item.name}
                                  label="Remove"
                                  warning="If this dish has ever been ordered it is hidden rather than deleted, so old orders still read correctly."
                                />
                              </Stack>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableWrap>
                )}
              </Stack>
            </CardBody>
          ))
        )}

        <CardBody>
          <Stack>
            <SectionHeader title="Add a dish" />
            {categoryOptions.length === 0 ? (
              <p className="kf-muted">Add a section first. A dish has to belong to one.</p>
            ) : (
              <AdminForm
                action="/api/v1/admin/menu/items"
                hidden={{ kitchenId: kitchen.id }}
                submitLabel="Add dish"
                successMessage="Dish added."
                fields={[
                  {
                    name: "categoryId",
                    label: "Section",
                    type: "select",
                    value: categoryOptions[0]?.value ?? "",
                    options: categoryOptions,
                    required: true,
                  },
                  { name: "name", label: "Name", type: "text", required: true },
                  { name: "priceNaira", label: "Price (naira)", type: "money", required: true, placeholder: "2500" },
                  { name: "description", label: "Description", type: "textarea", rows: 3 },
                  { name: "sortOrder", label: "Order in section", type: "number" },
                ]}
              />
            )}
          </Stack>
        </CardBody>

        <CardBody>
          <Stack>
            <SectionHeader title="Add a section" />
            <AdminForm
              action="/api/v1/admin/menu/categories"
              hidden={{ kitchenId: kitchen.id }}
              submitLabel="Add section"
              successMessage="Section added."
              fields={[
                { name: "name", label: "Section name", type: "text", required: true, placeholder: "Rice dishes" },
                { name: "sortOrder", label: "Order on the menu", type: "number" },
              ]}
            />
          </Stack>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Logins"
          action={<span className="kf-muted">{`${String(kitchen.staff.length)} people`}</span>}
        />
        <CardBody>
          {kitchen.staff.length === 0 ? (
            <Alert tone="warning">
              Nobody can sign in for this kitchen. Add an owner before it opens, or the orders arrive and nobody
              sees them.
            </Alert>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Person</Th>
                    <Th>Role</Th>
                    <Th>Active</Th>
                  </tr>
                </thead>
                <tbody>
                  {kitchen.staff.map((person) => (
                    <tr key={person.id}>
                      <Td label="Person">
                        {person.name}
                        <div className="kf-muted">{person.email ?? person.phone ?? "No contact on file"}</div>
                      </Td>
                      <Td label="Role">
                        <Badge tone={person.role === "owner" ? "accent" : "neutral"}>{person.role}</Badge>
                      </Td>
                      <Td label="Active">
                        <AdminToggle
                          action={`/api/v1/admin/kitchen-staff/${person.id}/active`}
                          name="isActive"
                          label={person.isActive ? "Can sign in" : "Locked out"}
                          checked={person.isActive}
                          successMessage={person.isActive ? "Login suspended." : "Login restored."}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </CardBody>

        <CardBody>
          <Stack>
            <SectionHeader title="Add a login" />
            {/* The password is set here and handed over in person. There is no
                password reset by email until Phase 9, and saying so on the form
                is the difference between an operator inventing a workaround and
                an operator knowing the workflow. */}
            <p className="kf-muted">
              There is no password reset yet, so agree the password with the person and hand it over.
            </p>
            <AdminForm
              action={`/api/v1/admin/kitchens/${kitchen.id}/staff`}
              submitLabel="Add login"
              successMessage="Login added."
              fields={[
                { name: "name", label: "Name", type: "text", required: true },
                { name: "email", label: "Email address", type: "email", required: true },
                { name: "phone", label: "Phone", type: "text" },
                {
                  name: "role",
                  label: "Role",
                  type: "select",
                  value: "staff",
                  options: [
                    { value: "owner", label: "Owner" },
                    { value: "staff", label: "Staff" },
                  ],
                  required: true,
                },
                {
                  name: "password",
                  label: "Password",
                  type: "password",
                  required: true,
                  hint: "At least twelve characters.",
                },
              ]}
            />
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}
