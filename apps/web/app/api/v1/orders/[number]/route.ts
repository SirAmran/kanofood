import { z } from "zod";

import { ApiError, bearerToken, kobo } from "@/lib/api/http";
import { publicRoute } from "@/lib/api/route";
import { routeId } from "@/lib/api/schema";
import { looksLikeOrderNumber, readOrder } from "@/lib/public/orders";

/**
 * `GET /api/v1/orders/:number` — read one order back.
 *
 * This is what the tracking screen polls and what the confirmation screen reads
 * once. Two ways in, neither of them an account: the token issued at placement,
 * sent as an `Authorization: Bearer` header or as `?token=`, or the order number
 * together with `?phone=`. The header is preferred and the query parameter exists
 * because a server-rendered tracking page has nowhere else to put it.
 *
 * The order number is uppercased before it is matched. A customer reading a
 * reference off a receipt and typing it in lower case is not making a mistake,
 * and the stored form is upper case by construction.
 */

export const dynamic = "force-dynamic";

const querySchema = z.object({
  token: z.string().trim().max(4096).optional(),
  phone: z.string().trim().max(32).optional(),
});

type Query = z.infer<typeof querySchema>;

export const GET = publicRoute<unknown, Query, { number: string }>({
  query: querySchema,
  handler: async ({ req, query, params }) => {
    const orderNumber = routeId(params, "number").toUpperCase();

    // One regex before any query. A tracking URL that is obviously not an order
    // number cannot match a row, so looking is wasted work, and the shape check
    // is cheaper than the round trip by a wide margin.
    if (!looksLikeOrderNumber(orderNumber)) {
      throw ApiError.notFound("That order is not on KanoFood.");
    }

    const view = await readOrder(orderNumber, {
      token: bearerToken(req) ?? query.token ?? null,
      phone: query.phone ?? null,
    });

    if (!view) throw ApiError.notFound("That order is not on KanoFood.");

    return {
      orderNumber: view.orderNumber,
      status: view.status,
      statusLabel: view.statusLabel,
      placedAt: view.placedAt,
      kitchen: view.kitchen,
      rider: view.rider,
      etaMinutes: view.etaMinutes,
      address: view.address,
      lines: view.lines.map((line) => ({
        name: line.name,
        unitPriceKobo: kobo(line.unitPriceKobo),
        quantity: line.quantity,
        lineTotalKobo: kobo(line.lineTotalKobo),
        notes: line.notes,
      })),
      subtotalKobo: kobo(view.subtotalKobo),
      deliveryFeeKobo: kobo(view.deliveryFeeKobo),
      totalKobo: kobo(view.totalKobo),
      paymentMethod: view.paymentMethod,
      deliveryNotes: view.deliveryNotes,
      timeline: view.timeline.map((event) => ({
        id: event.id,
        status: event.status,
        label: event.label,
        at: event.at,
        reason: event.reason,
        note: event.note,
      })),
      // Sent so the screen does not have to reimplement core's transition table
      // to decide whether to draw a cancel button. It is a hint for the interface
      // and never the enforcement: the cancel route checks again, because a
      // button that was drawn a minute ago proves nothing.
      canCancel: view.canCancel,
    };
  },
});
