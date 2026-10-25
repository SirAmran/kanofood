import { z } from "zod";

import { integerField, switchField } from "@/lib/api/schema";
import { staffRoute } from "@/lib/api/route";
import { listInbox } from "@/lib/notifications/inbox";

/**
 * `GET /api/v1/notifications` — the signed-in person's in-app inbox.
 *
 * A top-level staff resource rather than one under `/admin` and one under
 * `/kitchen`, because it is not a role's view of the platform: it is one person's
 * messages, and the query is identical for every role. Two copies would be one
 * query written twice and two chances for the bell to behave differently on two
 * screens. The actor comes from the session and is the only scoping parameter
 * this route accepts.
 *
 * `limit` bounds the page, `unread` narrows it. **The unread count in the
 * response is always the whole inbox**, never the page: a badge that showed how
 * many unread messages were on the page would read as a count and be a slice.
 *
 * The customer inbox is not here. A guest has no session and no bell; their
 * tracking page reads its own rows by token, in the slice that builds it.
 */

export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: integerField("Limit", { min: 1, max: 50 }).optional(),
  unread: switchField().optional(),
});

export const GET = staffRoute<unknown, z.infer<typeof querySchema>>({
  query: querySchema,
  handler: async ({ query, actor }) => {
    return listInbox({
      userId: actor.userId,
      limit: query.limit,
      unreadOnly: query.unread === true,
    });
  },
});
