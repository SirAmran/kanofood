import type { Metadata } from "next";

import { formatNaira } from "@kanofood/core";
import { Alert, Card, CardBody, EmptyState, Money, PageHeader, Stack } from "@kanofood/ui";

import { requireRider } from "@/lib/rider/session";
import { listRiderDeliveries } from "@/lib/rider/deliveries";
import { DeliveryCard } from "./_components/delivery-card";

/**
 * Today's deliveries. Screen 6.2 in docs/UX_SPEC.md.
 *
 * The whole job on one screen. Open deliveries first, then what is finished,
 * with the cash the rider is carrying shown once at the top because it is the
 * number they never get asked about until they walk into the office.
 *
 * The list is server-rendered on every request rather than cached: a rider who
 * has just been handed a new job by the admin needs to see it when they pull
 * the page down, not when a cache expires.
 */

export const metadata: Metadata = {
  title: "My deliveries",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RiderDeliveriesPage() {
  const actor = await requireRider();
  const list = await listRiderDeliveries({ riderId: actor.riderId });

  const open = list.rows.filter(
    (row) => row.status === "RIDER_ASSIGNED" || row.status === "PICKED_UP" || row.status === "OUT_FOR_DELIVERY",
  );
  const done = list.rows.filter((row) => !open.includes(row));

  return (
    <Stack>
      <PageHeader
        title="Today"
        sub={
          list.openCount === 0
            ? "Nothing waiting on you."
            : `${list.openCount} to do${list.doneCount > 0 ? `, ${list.doneCount} finished` : ""}.`
        }
      />

      {list.cashHeldKobo > 0n ? (
        <Alert tone="info">
          You are holding <Money value={formatNaira(list.cashHeldKobo)} /> in cash. Hand it over at
          the office and it will be marked received.
        </Alert>
      ) : null}

      {list.rows.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState title="No deliveries assigned">
              Nothing has been given to you in the last two days. Pull down to refresh.
            </EmptyState>
          </CardBody>
        </Card>
      ) : (
        <Stack>
          {open.map((row) => (
            <DeliveryCard key={row.orderId} row={row} />
          ))}

          {done.length > 0 ? (
            <>
              <h2 style={{ fontSize: "15px", margin: "var(--space-4) 0 0" }}>Finished</h2>
              {done.map((row) => (
                <DeliveryCard key={row.orderId} row={row} />
              ))}
            </>
          ) : null}
        </Stack>
      )}
    </Stack>
  );
}
