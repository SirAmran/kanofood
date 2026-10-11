import Link from "next/link";

import { Card, CardBody, EmptyState, PageHeader, Stack } from "@kanofood/ui";

/**
 * An admin URL that points at nothing.
 *
 * Reached by a mistyped order id, or by a link to a row that has since been
 * deleted. It is a page rather than a bare browser 404 because the person who
 * hits it is signed in and mid-task, and dropping them out of the admin shell
 * to a stock Next 404 loses the navigation they were working from.
 */
export default function AdminNotFound() {
  return (
    <Stack>
      <PageHeader title="Not found" />

      <Card>
        <CardBody>
          <EmptyState
            title="There is nothing at this address"
            action={
              <Link href="/admin" className="kf-btn kf-btn--secondary">
                Back to the dashboard
              </Link>
            }
          >
            The record may have been deleted, or the link may be wrong. Orders and riders are
            reachable from the list screens.
          </EmptyState>
        </CardBody>
      </Card>
    </Stack>
  );
}
