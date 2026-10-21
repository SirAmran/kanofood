import type { Metadata } from "next";
import Link from "next/link";

import { formatNaira } from "@kanofood/core";
import {
  Card,
  CardBody,
  CardHeader,
  Cluster,
  EmptyState,
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

import { AdminForm } from "@/app/(admin)/_components/admin-form";
import { AdminToggle } from "@/app/(admin)/_components/admin-toggle";
import { loadKitchenMenu } from "@/lib/kitchen/menu";
import { requireKitchen } from "@/lib/kitchen/session";

/**
 * The menu. Screen 5.5 in docs/UX_SPEC.md.
 *
 * Two switches, kept independent on purpose. A section switched off hides its
 * dishes without touching any dish; a dish marked sold out stays hidden when its
 * section comes back. That is what a kitchen actually means by "we have stopped
 * taking orders for rice" versus "the jollof is finished".
 *
 * The whole screen is one page rather than a list that leads to a list. A kitchen
 * has a few dozen dishes and one person manages them mid-service, and a second
 * level of navigation costs more than it saves.
 */

export const metadata: Metadata = { title: "Menu" };

export const dynamic = "force-dynamic";

export default async function KitchenMenuPage() {
  const actor = await requireKitchen();
  const categories = await loadKitchenMenu(actor.kitchenId);

  const categoryOptions = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));

  const itemCount = categories.reduce((total, category) => total + category.items.length, 0);
  const soldOut = categories.reduce(
    (total, category) => total + category.items.filter((item) => !item.isAvailable).length,
    0,
  );

  return (
    <Stack>
      <PageHeader
        title="Menu"
        sub={`${String(categories.length)} sections, ${String(itemCount)} dishes${
          soldOut > 0 ? `, ${String(soldOut)} sold out` : ""
        }`}
      />

      {categories.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState title="No menu yet">
              A kitchen needs a section before it can hold a dish. Add the first one below, then add
              dishes to it.
            </EmptyState>
          </CardBody>
        </Card>
      ) : (
        categories.map((category) => (
          <Card key={category.id}>
            <CardHeader
              title={category.name}
              action={
                <AdminToggle
                  action={`/api/v1/kitchen/menu/categories/${category.id}`}
                  method="PATCH"
                  name="isActive"
                  label="Showing on the menu"
                  checked={category.isActive}
                  successMessage={category.isActive ? "Section hidden." : "Section showing."}
                />
              }
            />
            <CardBody flush={category.items.length > 0}>
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
                        <Th>
                          <span className="kf-visually-hidden">Edit</span>
                        </Th>
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
                                {item.description ? (
                                  <div className="kf-list__meta">{item.description}</div>
                                ) : null}
                              </span>
                            </Cluster>
                          </Td>
                          <Td numeric label="Price">
                            <Money value={formatNaira(item.priceKobo)} />
                          </Td>
                          <Td label="Available">
                            <AdminToggle
                              action={`/api/v1/kitchen/menu/items/${item.id}/availability`}
                              name="isAvailable"
                              label={item.isAvailable ? "Available" : "Sold out"}
                              checked={item.isAvailable}
                              successMessage={item.isAvailable ? "Marked sold out." : "Back on the menu."}
                            />
                          </Td>
                          <Td label="Edit">
                            <Link
                              href={`/kitchen/menu/${item.id}`}
                              className="kf-btn kf-btn--secondary kf-btn--sm"
                            >
                              Edit
                            </Link>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </CardBody>
          </Card>
        ))
      )}

      <Card>
        <CardHeader title="Add a dish" />
        <CardBody>
          {categoryOptions.length === 0 ? (
            <p className="kf-muted">Add a section first. A dish has to belong to one.</p>
          ) : (
            <AdminForm
              action="/api/v1/kitchen/menu/items"
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
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Add a section" />
        <CardBody>
          <Stack>
            <SectionHeader title="A section groups dishes on the storefront" />
            <AdminForm
              action="/api/v1/kitchen/menu/categories"
              submitLabel="Add section"
              successMessage="Section added."
              fields={[
                { name: "name", label: "Section name", type: "text", required: true, placeholder: "Rice dishes" },
                { name: "sortOrder", label: "Order on the menu", type: "number" },
              ]}
            />
            <Spread>
              <span className="kf-muted">
                Sections are hidden rather than deleted, so dishes and past orders stay intact.
              </span>
            </Spread>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}
