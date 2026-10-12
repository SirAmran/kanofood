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
} from "@kanofood/ui";

import { AdminForm } from "@/app/(admin)/_components/admin-form";
import { listRiders } from "@/lib/admin/network";
import { requireAdmin } from "@/lib/admin/session";
import { toneForRiderState } from "@/lib/admin/status";

/**
 * Riders. Screen 7.6 in docs/UX_SPEC.md, list half.
 *
 * The column that earns this screen is cash in hand. A rider holding yesterday's
 * takings is the platform's largest unsecured exposure, and it is the one figure
 * nobody can reconstruct from memory at the end of a shift.
 *
 * State is derived, not stored: a rider is on a delivery because an order says
 * so, not because a flag was set and never cleared. So "on a delivery" here can
 * only ever mean a real one.
 */

export const metadata: Metadata = { title: "Riders" };

export const dynamic = "force-dynamic";

export default async function RidersPage() {
  await requireAdmin();
  const riders = await listRiders();

  const available = riders.filter((rider) => rider.state === "available").length;
  const cashOutKobo = riders.reduce((total, rider) => total + rider.cashInHandKobo, 0n);

  return (
    <Stack>
      <PageHeader
        title="Riders"
        sub={
          riders.length === 0
            ? "None yet."
            : `${String(riders.length)} in total, ${String(available)} available now, ${formatNaira(cashOutKobo)} of cash out with them.`
        }
      />

      {/* Cash out with riders is the number that decides whether anyone needs
          chasing tonight, so it is stated plainly rather than left to be summed
          off the table by eye. */}
      {cashOutKobo > 0n ? (
        <Alert tone="warning">
          {formatNaira(cashOutKobo)} is outstanding with riders. Handovers are recorded on the cash screen.
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Add a rider" />
        <CardBody>
          <p className="kf-muted">
            There is no password reset yet, so agree the password with the rider and hand it over. New riders start
            off shift: they go available from their own app.
          </p>
          <AdminForm
            action="/api/v1/admin/riders"
            submitLabel="Add rider"
            successMessage="Rider added. They start off shift."
            fields={[
              { name: "name", label: "Name", type: "text", required: true },
              { name: "phone", label: "Phone", type: "text", required: true },
              { name: "email", label: "Email address", type: "email", hint: "Optional. Used for the login if given." },
              { name: "vehicle", label: "Vehicle", type: "text", placeholder: "Bajaj Boxer, red" },
              {
                name: "password",
                label: "Password",
                type: "password",
                required: true,
                hint: "At least twelve characters.",
              },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="All riders" />
        {riders.length === 0 ? (
          <CardBody>
            <EmptyState title="No riders yet">
              Add the first one above. An order can only be assigned to a rider who exists and is trading.
            </EmptyState>
          </CardBody>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Rider</Th>
                  <Th>State</Th>
                  <Th numeric>Deliveries today</Th>
                  <Th numeric>Running</Th>
                  <Th numeric>Cash in hand</Th>
                  <Th numeric>Handed over</Th>
                </tr>
              </thead>
              <tbody>
                {riders.map((rider) => (
                  <tr key={rider.id}>
                    <Td label="Rider">
                      <Link href={`/admin/riders/${rider.id}`}>{rider.name}</Link>
                      <div className="kf-muted">
                        {rider.phone}
                        {rider.vehicle ? ` · ${rider.vehicle}` : ""}
                      </div>
                    </Td>
                    <Td label="State">
                      <Badge tone={toneForRiderState(rider.state)}>{rider.state}</Badge>
                    </Td>
                    <Td numeric label="Deliveries today">
                      {String(rider.deliveriesToday)}
                    </Td>
                    <Td numeric label="Running">
                      {String(rider.inFlight)}
                    </Td>
                    {/* Only a rider who collects cash has any, so a zero is shown
                        as a dash rather than as a figure to reconcile. */}
                    <Td numeric label="Cash in hand">
                      {rider.cashInHandKobo === 0n ? (
                        <span className="kf-muted">—</span>
                      ) : (
                        <Money value={formatNaira(rider.cashInHandKobo)} />
                      )}
                    </Td>
                    <Td numeric label="Handed over">
                      {rider.cashHandedOverKobo === 0n ? (
                        <span className="kf-muted">—</span>
                      ) : (
                        <Money value={formatNaira(rider.cashHandedOverKobo)} />
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <p className="kf-muted">
        <Cluster>
          <span>State is worked out from live orders, never stored.</span>
          <span>&ldquo;On a delivery&rdquo; means an order is actually assigned and unfinished.</span>
        </Cluster>
      </p>
    </Stack>
  );
}
