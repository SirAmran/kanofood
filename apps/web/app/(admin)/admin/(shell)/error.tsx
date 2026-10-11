"use client";

import Link from "next/link";

import { Card, CardBody, ErrorState, PageHeader, Stack } from "@kanofood/ui";

/**
 * What an admin sees when a read fails.
 *
 * One boundary for the whole shell rather than one per screen, because every
 * admin screen is a read of the same database and every failure to reach it
 * needs the same two things: the truth about what happened, and a way to try
 * again. UX_SPEC section 8 requires a list to handle a failed read as a state
 * rather than as an exception, and this is that state for all of them.
 *
 * The message is deliberately not the error itself. A driver error names tables
 * and columns, which tells an operator nothing and tells anyone who finds a
 * screenshot rather more than they should know. `digest` is shown because it is
 * the one piece of the real error that can be matched against the server log.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Stack>
      <PageHeader title="Something went wrong" />

      <Card>
        <CardBody>
          <ErrorState
            title="This page could not be loaded"
            action={
              <div className="kf-cluster">
                <button type="button" className="kf-btn kf-btn--primary" onClick={reset}>
                  Try again
                </button>
                <Link href="/admin" className="kf-btn kf-btn--ghost">
                  Back to the dashboard
                </Link>
              </div>
            }
          >
            The database did not answer, or the request did not finish. Nothing was changed.
          </ErrorState>

          {error.digest ? (
            <p className="kf-muted">
              Reference <span className="kf-numeric">{error.digest}</span>
            </p>
          ) : null}
        </CardBody>
      </Card>
    </Stack>
  );
}
