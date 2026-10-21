import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatNaira } from "@kanofood/core";
import {
  Card,
  CardBody,
  CardHeader,
  Cluster,
  Media,
  PageHeader,
  Stack,
} from "@kanofood/ui";

import { AdminDelete } from "@/app/(admin)/_components/admin-delete";
import { AdminForm } from "@/app/(admin)/_components/admin-form";
import { AdminUpload } from "@/app/(admin)/_components/admin-upload";
import { loadKitchenMenuItem } from "@/lib/kitchen/menu";
import { requireKitchen } from "@/lib/kitchen/session";

/**
 * The dish editor. Screen 5.6 in docs/UX_SPEC.md.
 *
 * Everything about one dish in one place: the name and price customers see, the
 * section it sits in, the photograph, and whether it is available. The photo is
 * the reason this is a page rather than a row in a table: the upload needs room,
 * and the preview next to it is what makes a wrong file obvious before it is
 * saved.
 *
 * Removal hides a dish that has ever been ordered rather than deleting it, so
 * old orders still read back exactly as they were placed.
 */

export const metadata: Metadata = { title: "Dish" };

export const dynamic = "force-dynamic";

export default async function KitchenMenuItemPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireKitchen();
  const { id } = await params;

  const item = await loadKitchenMenuItem({ kitchenId: actor.kitchenId, itemId: id });
  if (!item) notFound();

  return (
    <Stack>
      <PageHeader
        title={item.name}
        sub={
          <Cluster>
            <span className="kf-muted">{formatNaira(item.priceKobo)}</span>
            <span className="kf-muted">{item.isAvailable ? "Available" : "Sold out"}</span>
            <Link href="/kitchen/menu">Back to the menu</Link>
          </Cluster>
        }
      />

      <Card>
        <CardHeader title="Photograph" />
        <CardBody>
          <Cluster>
            <Media
              src={item.imageUrl}
              alt={item.name}
              shape="thumb"
              fallback={<img src="/images/dish-placeholder.svg" alt="" />}
            />
            <AdminUpload
              endpoint="/api/v1/kitchen/uploads"
              purpose="menu-item"
              ownerId={item.id}
              label="Replace photo"
              successMessage="Photo updated."
            />
          </Cluster>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Details" />
        <CardBody>
          <AdminForm
            action={`/api/v1/kitchen/menu/items/${item.id}`}
            method="PATCH"
            submitLabel="Save dish"
            successMessage="Dish saved."
            fields={[
              {
                name: "categoryId",
                label: "Section",
                type: "select",
                value: item.categoryId,
                options: item.categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                })),
                required: true,
              },
              { name: "name", label: "Name", type: "text", value: item.name, required: true },
              {
                name: "priceNaira",
                label: "Price (naira)",
                type: "money",
                value: formatNaira(item.priceKobo),
                required: true,
                hint: "Changing this never changes an order already placed. Those keep the price they were placed at.",
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
                label: "Available today",
                type: "switch",
                value: item.isAvailable,
              },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Remove" />
        <CardBody>
          <AdminDelete
            action={`/api/v1/kitchen/menu/items/${item.id}`}
            what={item.name}
            label="Remove this dish"
            redirectTo="/kitchen/menu"
            successMessage="Dish removed from the menu."
            warning="If this dish has ever been ordered it is hidden rather than deleted, so old orders still read correctly."
          />
        </CardBody>
      </Card>
    </Stack>
  );
}
