import type { ReactNode } from "react";

/**
 * Admin route group. The live view, order management, kitchens, riders, zones,
 * cash reconciliation, settlements and analytics. Screens 7.1 to 7.12 in
 * docs/UX_SPEC.md.
 *
 * Admin sessions are the most protected: shorter token lifetime than any other
 * role. Authorisation is server side and fails closed.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div data-role="admin">{children}</div>;
}
