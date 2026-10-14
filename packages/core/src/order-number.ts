/**
 * The customer-facing order number.
 *
 * This is not the primary key. The primary key is a UUID that never leaves the
 * server; the order number is a short reference a customer reads back over the
 * phone, so it is built to be spoken and typed rather than to be unique by
 * construction. Uniqueness is a database constraint the service settles against
 * the table, exactly as it settles a kitchen slug — see `createKitchen`.
 *
 * Format, and where it comes from:
 *
 *     MAM-1014231545-AB
 *     ^^^ ^^^^^^^^^^ ^^
 *     |   |          two letters of randomness
 *     |   month, day, hour, minute, second in West Africa Time
 *     up to three letters of the kitchen's name
 *
 * The shape mirrors the reference the landing pages already generate
 * (`MISTFAN-MMDDHHmmss-XX` in `mistfans/index.html`), so a customer who has
 * ordered from one of those pages recognises this one. The difference is the
 * prefix: the landing pages have one product, so theirs is a constant, and this
 * platform has many kitchens, so the prefix names the kitchen.
 *
 * **West Africa Time, deliberately, and not the server's zone.** Nigeria is
 * UTC+1 all year with no daylight saving. The deployment runs in UTC, so a stamp
 * taken from the runtime's local clock would read an hour behind the customer
 * holding the phone — and the whole point of the stamp is that it agrees with
 * what they remember. Shifting the instant and reading it back with the `getUTC*`
 * family renders a fixed offset with no timezone library and no environment read,
 * so this file stays as pure as the rest of the core.
 */

/** Used when a kitchen's name yields no letters at all, e.g. a name of digits. */
export const ORDER_PREFIX_FALLBACK = "KIT";

/** Three is what fits in a reference somebody reads aloud. */
const ORDER_PREFIX_MAX = 3;

const ORDER_SUFFIX_LENGTH = 2;

/** Exactly the suffixes this module is willing to build a reference from. */
const ORDER_SUFFIX_PATTERN = /^[A-Z]{2}$/;

/** Nigeria has never observed daylight saving, so one constant is the whole rule. */
const WAT_OFFSET_MINUTES = 60;

/**
 * The letters a kitchen contributes to its order numbers.
 *
 * Everything that is not a letter is dropped rather than replaced, so
 * "Al-Baik 2" becomes `ALB` and not `ALB` plus punctuation nobody can say out
 * loud. A name with fewer than three letters keeps what it has rather than being
 * padded: `JO` is honest about the kitchen, and `JOX` is not.
 */
export function orderNumberPrefix(kitchenName: string): string {
  const letters = kitchenName.toUpperCase().replace(/[^A-Z]/g, "");
  return letters.slice(0, ORDER_PREFIX_MAX) || ORDER_PREFIX_FALLBACK;
}

/**
 * Month, day, hour, minute, second in West Africa Time, zero-padded.
 *
 * Two digits each and no separator, so the stamp is ten characters and can be
 * read as five pairs: `1014 231545` is the 14th at 23:15:45.
 */
export function formatOrderStamp(at: Date): string {
  if (Number.isNaN(at.getTime())) {
    throw new TypeError("An order number cannot be stamped with an invalid date.");
  }

  const shifted = new Date(at.getTime() + WAT_OFFSET_MINUTES * 60_000);
  const pad = (value: number): string => String(value).padStart(2, "0");

  return (
    pad(shifted.getUTCMonth() + 1) +
    pad(shifted.getUTCDate()) +
    pad(shifted.getUTCHours()) +
    pad(shifted.getUTCMinutes()) +
    pad(shifted.getUTCSeconds())
  );
}

/**
 * Build the reference.
 *
 * Both the instant and the random suffix arrive as parameters rather than being
 * read here. That is what keeps this testable to the character — a function that
 * calls `Date.now()` and `Math.random()` can only be checked for shape, never for
 * value, and the value is the part a customer reads back.
 *
 * A suffix that is not two letters throws. It comes from one call site, and a
 * caller that hands over the wrong thing should hear about it here rather than
 * produce a reference that fails a uniqueness check for a reason nobody can see.
 */
export function buildOrderNumber(input: {
  readonly kitchenName: string;
  readonly at: Date;
  readonly suffix: string;
}): string {
  const suffix = input.suffix.toUpperCase();
  if (!ORDER_SUFFIX_PATTERN.test(suffix)) {
    throw new TypeError(
      `An order suffix must be ${ORDER_SUFFIX_LENGTH} letters, received ${JSON.stringify(input.suffix)}`,
    );
  }

  return `${orderNumberPrefix(input.kitchenName)}-${formatOrderStamp(input.at)}-${suffix}`;
}

/**
 * The shape of a well-formed order number.
 *
 * Used to reject an obviously malformed tracking lookup before it costs a
 * database round trip. The prefix is one to three letters because a short
 * kitchen name keeps its short prefix, as above.
 */
const ORDER_NUMBER_PATTERN = /^[A-Z]{1,3}-\d{10}-[A-Z]{2}$/;

export function isOrderNumber(value: string): boolean {
  return ORDER_NUMBER_PATTERN.test(value);
}
