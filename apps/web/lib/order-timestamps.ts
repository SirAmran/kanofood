import { Prisma } from "@kanofood/db";
import type { OrderStatus } from "@kanofood/core";

/**
 * The timestamp column each order state sets.
 *
 * Extracted from the admin write path when the kitchen queue became the second
 * writer: two mappings of status to timestamp would drift, and the first symptom
 * of the drift would be one interface's history showing a time the other's does
 * not. The switch is exhaustive over the status union, so a fourteenth status
 * breaks this file rather than writing a status with no time against it.
 */
export function statusTimestamps(
  to: OrderStatus,
  at: Date,
): Prisma.OrderUpdateManyMutationInput {
  switch (to) {
    case "CONFIRMED":
      return { confirmedAt: at };
    case "KITCHEN_ACCEPTED":
      return { kitchenAcceptedAt: at };
    case "PREPARING":
      return { preparingAt: at };
    case "READY_FOR_PICKUP":
      return { readyForPickupAt: at };
    case "RIDER_ASSIGNED":
      return { riderAssignedAt: at };
    case "PICKED_UP":
      return { pickedUpAt: at };
    case "OUT_FOR_DELIVERY":
      return { outForDeliveryAt: at };
    case "DELIVERED":
      return { deliveredAt: at };
    case "CUSTOMER_CANCELLED":
      return { customerCancelledAt: at };
    case "KITCHEN_REJECTED":
      return { kitchenRejectedAt: at };
    case "ADMIN_CANCELLED":
      return { adminCancelledAt: at };
    case "DELIVERY_FAILED":
      return { deliveryFailedAt: at };
    // The opening state has no event that moves anything into it.
    case "PENDING_CONFIRMATION":
      return {};
  }
}
