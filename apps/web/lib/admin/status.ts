import { ACTIVE_STATUSES, ORDER_STATUS_LABELS, isTerminal } from "@kanofood/core";
import type { OrderStatus } from "@kanofood/core";
import type { Tone } from "@kanofood/ui";

/**
 * How an order state looks, in one place.
 *
 * UX_SPEC section 2 requires that a customer, a kitchen operator, a rider and an
 * admin read the same word in the same colour for the same state. The words live
 * in `@kanofood/core` next to the transition table, because they are domain
 * vocabulary. The colour is a design decision, so it lives here, next to the
 * design system it names.
 *
 * The mapping is total, and the compiler enforces that: adding a fourteenth
 * status to the core list breaks this file rather than silently rendering it
 * grey.
 */

const TONES: Readonly<Record<OrderStatus, Tone>> = {
  // Waiting on a human, which is the one state that is a warning rather than
  // information.
  PENDING_CONFIRMATION: "warning",

  // Confirmed and in the kitchen's hands. Informational: nothing is late yet.
  CONFIRMED: "info",
  KITCHEN_ACCEPTED: "info",

  // Moving. The accent means "in flight" everywhere in this system.
  PREPARING: "accent",
  READY_FOR_PICKUP: "accent",
  RIDER_ASSIGNED: "accent",
  PICKED_UP: "accent",
  OUT_FOR_DELIVERY: "accent",

  DELIVERED: "success",

  // Ended without delivery. Neutral for a customer's own cancellation, because
  // nothing went wrong; danger for the three that mean something did.
  CUSTOMER_CANCELLED: "neutral",
  KITCHEN_REJECTED: "danger",
  ADMIN_CANCELLED: "danger",
  DELIVERY_FAILED: "danger",
};

export function toneForStatus(status: OrderStatus): Tone {
  return TONES[status];
}

/** The word, from the one table every interface reads. */
export function labelForStatus(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status];
}

/** Still moving. What the live view shows and what a badge pulses for. */
export function isLive(status: OrderStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export { isTerminal };

/**
 * The forward path, for drawing progress. Every order that is not terminated
 * walks this list; a jump off it is a failure, which is why the two are separate
 * and why the transition table is what actually governs movement.
 */
export const HAPPY_PATH: readonly OrderStatus[] = [
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "KITCHEN_ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "RIDER_ASSIGNED",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

/** How far along the happy path a state is, or -1 for a failed end. */
export function pathPosition(status: OrderStatus): number {
  return HAPPY_PATH.indexOf(status);
}

/**
 * Elapsed time in the words an operator uses, not the words a machine uses.
 *
 * A live queue is read at a glance to spot the order that has been sitting too
 * long, so "12 min" and "1h 40m" are the useful shapes and "0.2 hours" is not.
 * Past a day it stops being a duration anyone reasons about and becomes a date.
 */
export function elapsedSince(from: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) {
    return remainder === 0 ? `${String(hours)}h` : `${String(hours)}h ${String(remainder)}m`;
  }

  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${String(days)} days`;
}

/**
 * A timestamp for a table cell: date and time, in the operator's own zone.
 *
 * `Intl` with an explicit locale rather than the ambient default, so a server
 * rendering in UTC and a browser rendering in Lagos produce the same string and
 * a hydration mismatch cannot happen.
 */
export function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Lagos",
  }).format(value);
}

export function formatDay(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Lagos",
  }).format(value);
}

/** The `<input type="date">` value for a date, in the operator's zone. */
export function toDateInput(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Lagos",
  }).format(value);

  return parts;
}

/**
 * The instant a Lagos day began.
 *
 * Kano runs on West Africa Time, which is UTC+1 all year with no daylight
 * saving, so this is arithmetic rather than a timezone database. It is written
 * out rather than assumed because "today's orders" computed from the server's
 * midnight is wrong by an hour, and an hour either side of midnight is exactly
 * when a restaurant's day is still running.
 *
 * The shift-and-reinterpret trick: move the instant forward an hour, read the
 * date parts as if they were UTC, take UTC midnight of that date, then move back
 * an hour.
 */
export function lagosDayStart(now: Date = new Date()): Date {
  const OFFSET_MS = 60 * 60 * 1000;
  const shifted = new Date(now.getTime() + OFFSET_MS);
  const midnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(midnight - OFFSET_MS);
}

/** The instant `days` Lagos days ago began. Used for the "last 7 days" windows. */
export function lagosDayStartDaysAgo(days: number, now: Date = new Date()): Date {
  const start = lagosDayStart(now);
  return new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
}
