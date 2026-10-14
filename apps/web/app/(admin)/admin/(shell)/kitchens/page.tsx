import type { Metadata } from "next";
import Link from "next/link";

import { formatNaira } from "@kanofood/core";
import {
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
} from "@kanofood/ui";

import { AdminForm } from "@/app/(admin)/_components/admin-form";
import { listKitchens } from "@/lib/admin/kitchens";
import { requireAdmin } from "@/lib/admin/session";

/**
 * Kitchens. Screen 7.5 in docs/UX_SPEC.md.
 *
 * The list is the answer to "who is trading today", and the create form is on
 * the same page because a kitchen is created as an operational act, in the
 * middle of a phone call, not as a separate trip through a settings screen.
 * ARCHITECTURE section 15 makes the same point from the other end: the seed
 * creates no kitchens, so this screen is the only way one comes into existence.
 *
 * New kitchens start closed. Opening one is a deliberate act once the menu is in
 * and the phone number works, so the create form does not offer it.
 */

export const metadata: Metadata = { title: "Kitchens" };

export const dynamic = "force-dynamic";

export default async function KitchensPage() {
  await requireAdmin();
  const kitchens = await listKitchens();

  const open = kitchens.filter((kitchen) => kitchen.isOpen && kitchen.isActive).length;
  const salesTodayKobo = kitchens.reduce((total, kitchen) => total + kitchen.salesTodayKobo, 0n);

  return (
    <Stack>
      <PageHeader
        title="Kitchens"
        sub={
          kitchens.length === 0
            ? "None yet."
            : `${String(kitchens.length)} in total, ${String(open)} open now, ${formatNaira(salesTodayKobo)} sold today.`
        }
      />

      <Card>
        <CardHeader title="Add a kitchen" />
        <CardBody>
          <AdminForm
            action="/api/v1/admin/kitchens"
            submitLabel="Add kitchen"
            successMessage="Kitchen added. It is closed until you open it."
            fields={[
              { name: "name", label: "Name", type: "text", required: true, placeholder: "Mama Aisha Kitchen" },
              { name: "phone", label: "Phone", type: "text", hint: "The number customers' orders are confirmed from." },
              { name: "addressText", label: "Address", type: "text" },
              { name: "landmark", label: "Landmark", type: "text", hint: "How a rider finds it." },
              { name: "prepTimeMinutes", label: "Preparation time (minutes)", type: "number" },
              {
                name: "lat",
                label: "Latitude",
                type: "number",
                hint: "The pin delivery fees are measured from. Both coordinates or neither.",
              },
              { name: "lng", label: "Longitude", type: "number", hint: "Example: 8.5167" },
              { name: "description", label: "Description", type: "textarea", rows: 3 },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="All kitchens" />
        {kitchens.length === 0 ? (
          <CardBody>
            <EmptyState title="No kitchens yet">
              Add the first one above. A kitchen has to exist before a menu, a rider or an order can point at
              it.
            </EmptyState>
          </CardBody>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Kitchen</Th>
                  <Th>Status</Th>
                  <Th numeric>Orders today</Th>
                  <Th numeric>Sold today</Th>
                  <Th numeric>Menu</Th>
                  <Th numeric>Commission</Th>
                </tr>
              </thead>
              <tbody>
                {kitchens.map((kitchen) => (
                  <tr key={kitchen.id}>
                    <Td>
                      <Link href={`/admin/kitchens/${kitchen.id}`}>{kitchen.name}</Link>
                      <div className="kf-muted">{kitchen.phone ?? "No phone number"}</div>
                    </Td>
                    <Td>
                      <Cluster>
                        {kitchen.isActive ? (
                          <Badge tone={kitchen.isOpen ? "success" : "neutral"}>
                            {kitchen.isOpen ? "Open" : "Closed"}
                          </Badge>
                        ) : (
                          <Badge tone="danger">Suspended</Badge>
                        )}
                        {kitchen.prepTimeMinutes === null ? null : (
                          <span className="kf-muted">{String(kitchen.prepTimeMinutes)} min</span>
                        )}
                      </Cluster>
                    </Td>
                    <Td numeric>{String(kitchen.ordersToday)}</Td>
                    <Td numeric>
                      <Money value={formatNaira(kitchen.salesTodayKobo)} />
                    </Td>
                    <Td numeric>{String(kitchen.menuItemCount)}</Td>
                    {/* The rate is what the operator typed, and the actual figure
                        on a hundred thousand naira is what they can check. */}
                    <Td numeric>
                      {kitchen.commissionRate === null ? (
                        <span className="kf-muted">Platform default</span>
                      ) : (
                        `${kitchen.commissionRate}%`
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </Stack>
  );
}
