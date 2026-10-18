"use client";

import { useEffect } from "react";

import { ErrorState } from "@kanofood/ui";

/**
 * The storefront's failure boundary. A read that fails here is almost always
 * the network or the database being briefly away, so the screen offers a retry
 * rather than anything clever.
 */
export default function CustomerError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // The server logs the real error; this keeps the browser console honest.
    console.error(error);
  }, [error]);

  return (
    <div className="sf-state-pad">
      <ErrorState
        title="That did not load"
        action={
          <button type="button" className="kf-btn kf-btn--primary kf-btn--sm" onClick={reset}>
            Try again
          </button>
        }
      >
        Check your connection and try once more.
      </ErrorState>
    </div>
  );
}
