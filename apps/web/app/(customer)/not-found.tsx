import Link from "next/link";

import { EmptyState, buttonClass } from "@kanofood/ui";

/**
 * A kitchen or dish that is not there, or a mistyped URL. Written for the
 * customer rather than the developer: no status code, and the way back is a
 * button.
 */
export default function CustomerNotFound() {
  return (
    <div className="sf-state-pad">
      <EmptyState
        title="We could not find that"
        action={
          <Link href="/" className={buttonClass({ variant: "primary", size: "sm" })}>
            Back to home
          </Link>
        }
      >
        The kitchen or dish may have closed, or the link may be wrong.
      </EmptyState>
    </div>
  );
}
