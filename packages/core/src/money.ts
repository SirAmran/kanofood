/**
 * Money.
 *
 * Every amount in this system is an integer number of kobo held as a bigint.
 * One naira is 100 kobo, so 1,000 naira is 100000n. There is no floating point
 * anywhere: not in the schema, not in application code, not in an API payload.
 * See docs/ARCHITECTURE.md section 5.1.
 *
 * BIGINT rather than INT because lifetime aggregate revenue passes the 2.1
 * billion kobo ceiling of a 32-bit integer. Postgres BIGINT arrives through
 * Prisma as a JavaScript bigint, which JSON.stringify throws on, so responses
 * are serialised through `serialiseJson` below rather than raw JSON.stringify.
 */

export type Kobo = bigint;

export const KOBO_PER_NAIRA = 100n;

/** The naira sign, held here so formatting has exactly one source. */
export const NAIRA_SIGN = "₦";

/** Digits, optionally with one or two decimal places. No sign, no separators. */
const DECIMAL_AMOUNT = /^\d+(\.\d{1,2})?$/;

/**
 * Parse a naira amount typed by a human into kobo.
 *
 * Deliberately takes a string and not a number. A number parameter is an
 * invitation to write `parseNairaToKobo(price * 1.075)` and reintroduce the
 * exact class of rounding error this module exists to prevent.
 *
 * Accepts "1000", "1,000.50", "250.5", and tolerates a leading naira sign.
 */
export function parseNairaToKobo(input: string): Kobo {
  const cleaned = input.replace(/[\s,₦]/g, "");
  const negative = cleaned.startsWith("-");
  const digits = negative ? cleaned.slice(1) : cleaned;

  if (!DECIMAL_AMOUNT.test(digits)) {
    throw new TypeError(`Not a naira amount: ${JSON.stringify(input)}`);
  }

  const [whole = "0", fraction = ""] = digits.split(".");
  const kobo = BigInt(whole) * KOBO_PER_NAIRA + BigInt(fraction.padEnd(2, "0") || "0");
  return negative ? -kobo : kobo;
}

/** Format kobo for display: 100000n becomes "₦1,000.00". */
export function formatNaira(kobo: Kobo): string {
  const negative = kobo < 0n;
  const absolute = negative ? -kobo : kobo;
  const whole = (absolute / KOBO_PER_NAIRA).toString();
  const fraction = (absolute % KOBO_PER_NAIRA).toString().padStart(2, "0");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${NAIRA_SIGN}${grouped}.${fraction}`;
}

/**
 * The same amount for assistive technology. A screen reader given "₦1,000.00"
 * reads a symbol and a run of digits; given "1000 naira" it says one thousand
 * naira. Use this for the aria-label and keep `formatNaira` for the eye.
 */
export function formatNairaSpoken(kobo: Kobo): string {
  const negative = kobo < 0n;
  const absolute = negative ? -kobo : kobo;
  const whole = absolute / KOBO_PER_NAIRA;
  const fraction = absolute % KOBO_PER_NAIRA;

  const parts: string[] = [];
  if (whole > 0n || fraction === 0n) parts.push(`${whole} naira`);
  if (fraction > 0n) parts.push(`${fraction} kobo`);

  return `${negative ? "minus " : ""}${parts.join(" ")}`;
}

/** Add a list of amounts. Summing is the only safe way to total money. */
export function sumKobo(amounts: readonly Kobo[]): Kobo {
  let total = 0n;
  for (const amount of amounts) total += amount;
  return total;
}

/**
 * Multiply a unit price by a whole quantity. Quantity is a plain number because
 * it is a count of items, never a money value, and it is checked so a float or a
 * negative cannot slip through.
 */
export function multiplyKobo(unitPrice: Kobo, quantity: number): Kobo {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new RangeError(`Quantity must be a non-negative integer, got ${quantity}`);
  }
  return unitPrice * BigInt(quantity);
}

/** A negative amount is a reversal or a refund, not an error. This names it. */
export function negateKobo(amount: Kobo): Kobo {
  return -amount;
}

/**
 * JSON.stringify throws on a bigint. Money crosses the wire as a string of kobo
 * digits and never as a JSON number, because a JSON number is a double and
 * silently loses precision past 2^53.
 */
export function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/** Serialise any payload containing money. Use this instead of JSON.stringify. */
export function serialiseJson(value: unknown): string {
  return JSON.stringify(value, bigIntReplacer);
}
