import { ORDER_STATUS_LABELS } from "@kanofood/core";
import { z } from "zod";

import { kobo } from "@/lib/api/http";
import { publicRoute } from "@/lib/api/route";
import { optionalText, phoneField, requiredText } from "@/lib/api/schema";
import { placeOrder } from "@/lib/public/orders";

/**
 * `POST /api/v1/orders` — place an order.
 *
 * Guest checkout, deliberately. There is no customer account to sign in to: the
 * customer gives a name, a phone number and an address, and gets back an order
 * number and a token that is the only credential the order has. Requiring a
 * password before somebody can buy food is a conversion tax this platform does
 * not need to charge, and the token does everything an account would for a
 * single order.
 *
 * **No amount is accepted from the caller.** There is no `totalKobo`, no
 * `deliveryFeeKobo` and no unit price anywhere in the schema below. Every figure
 * is read from the menu and recomputed from the coordinates in `placeOrder`, and
 * zod drops unknown keys, so a body that carries a price has it discarded rather
 * than refused. That is the correct order of operations for anything a customer
 * can type.
 *
 * Coordinates are `z.number()` rather than the string-parsing field helpers,
 * because this is a JSON body and JSON has numbers. It is the same spelling the
 * public quote route uses, and for the same reason: one convention per kind of
 * input, so nobody has to guess which one a given route took.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kitchenSlug: z.string().trim().min(1).max(120),
  lines: z
    .array(
      z.object({
        menuItemId: z.string().trim().min(1).max(64),
        // A ceiling rather than a rule about appetite: fifty of one dish is
        // somebody fat-fingering a keypad, and this is the point past which the
        // quantity stops being a plausible order and starts being a typo.
        quantity: z.number().int().min(1).max(50),
        notes: optionalText(300),
      }),
    )
    .min(1, "Your cart is empty.")
    .max(40, "That is more lines than one order can carry."),
  customer: z.object({
    name: requiredText("Your name", 120),
    phone: phoneField(),
  }),
  address: z.object({
    label: optionalText(60),
    addressText: requiredText("Delivery address", 300),
    landmark: optionalText(200),
    instructions: optionalText(300),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  paymentMethod: z.enum(["cod", "transfer", "card"]),
  deliveryNotes: optionalText(500),
});

export const POST = publicRoute({
  body: bodySchema,
  handler: async ({ body }) => {
    const placed = await placeOrder({
      kitchenSlug: body.kitchenSlug,
      lines: body.lines,
      customer: body.customer,
      address: body.address,
      paymentMethod: body.paymentMethod,
      deliveryNotes: body.deliveryNotes,
    });

    /**
     * The token is returned and never built into a URL here. A credential in a
     * query string lands in access logs, in `Referer` headers and in the history
     * of any browser it is pasted into; the confirmation screen stores it and
     * sends it as a header instead. The order number is safe to put in a link.
     */
    return {
      orderNumber: placed.orderNumber,
      token: placed.token,
      status: placed.status,
      statusLabel: ORDER_STATUS_LABELS[placed.status],
      placedAt: placed.placedAt,
      kitchen: { name: placed.kitchenName, slug: placed.kitchenSlug },
      etaMinutes: placed.etaMinutes,
      paymentMethod: placed.paymentMethod,
      subtotalKobo: kobo(placed.subtotalKobo),
      deliveryFeeKobo: kobo(placed.deliveryFeeKobo),
      totalKobo: kobo(placed.totalKobo),
    };
  },
});
