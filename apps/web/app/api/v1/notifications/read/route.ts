import { z } from "zod";

import { staffRoute } from "@/lib/api/route";
import { markInboxRead } from "@/lib/notifications/inbox";

/**
 * `POST /api/v1/notifications/read` — clear the badge.
 *
 * Two callers, one route. The bell sends the ids it just showed, so a message
 * that arrived while the panel was open is not silently marked read by a person
 * who never saw it. A "mark all read" control omits `ids` entirely.
 *
 * Ids are accepted and then narrowed by owner, so a caller cannot clear somebody
 * else's badge by guessing at ids: a wrong id matches no row and the update is a
 * no-op rather than an error. Answering "that is not yours" would confirm the id
 * exists, which is a small leak with no upside.
 *
 * Nothing here is soft about repeats: only unread rows are written, so calling
 * this twice records when the person first read the message, not when they last
 * opened the panel.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /**
   * The rows the caller is looking at. Omitted means all of them, which is what
   * the inbox's own button sends. Capped because this arrives from a browser and
   * an unbounded `in` list is a free way to make one query expensive.
   */
  ids: z.array(z.uuid("That is not a notification id.")).max(50).optional(),
});

export const POST = staffRoute({
  body: bodySchema,
  handler: async ({ body, actor }) => {
    return markInboxRead({ userId: actor.userId, ids: body.ids });
  },
});
