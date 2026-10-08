/**
 * Order money. docs/PRODUCT_SPEC.md section 10, docs/ARCHITECTURE.md section 5.
 *
 * Three jobs, all pure arithmetic over `bigint` kobo:
 *
 * 1. Total an order from its lines and the delivery fee.
 * 2. Derive what is expected, collected and outstanding on an order. These are
 *    derived and never stored, per section 5, so they cannot go stale against
 *    the payments they come from.
 * 3. Split a kitchen's gross into platform commission and net payable.
 *
 * The one place rounding is unavoidable is commission: a rate applied to kobo
 * rarely divides evenly, and a fraction of a kobo is not representable. The rule
 * is **round half up**, and it is stated once here rather than left to whichever
 * language operator a future caller happens to reach for.
 */

import type { Kobo } from "./money.ts";
import { multiplyKobo, sumKobo } from "./money.ts";

/** A rate of 1 is 10,000 basis points. Rates are not money; this keeps them integers. */
export const BASIS_POINT_SCALE = 10_000n;

/** A commission rate of 100%, the ceiling. Decimal(5,4) can hold more; it means nothing. */
export const MAX_BASIS_POINTS = 10_000;

/** One line of an order as the customer built it. */
export interface OrderLineInput {
  readonly unitPriceKobo: Kobo;
  readonly quantity: number;
}

export interface OrderTotals {
  readonly subtotalKobo: Kobo;
  readonly deliveryFeeKobo: Kobo;
  readonly discountKobo: Kobo;
  readonly totalKobo: Kobo;
}

export interface PaymentLike {
  readonly amountKobo: Kobo;
}

export interface OrderMoney {
  /** What the order is for: `total_kobo`. */
  readonly expectedKobo: Kobo;
  /** What has actually been taken, over every payment against the order. */
  readonly collectedKobo: Kobo;
  /** `expected - collected`. Negative means the customer has overpaid. */
  readonly outstandingKobo: Kobo;
}

function assertNonNegativeKobo(amount: Kobo, label: string): void {
  if (amount < 0n) {
    throw new RangeError(`${label} cannot be negative, got ${amount}`);
  }
}

/**
 * Total an order.
 *
 * Each line is priced from its own snapshot, never from the live menu: the
 * caller passes `unitPriceSnapshotKobo`. Rule 6 in PRODUCT_SPEC section 13 is
 * that a menu price change never alters an existing order, and this is where
 * that is either honoured or broken.
 *
 * A line with quantity 0 is refused. An order line for nothing is a bug
 * upstream, and quietly totalling it to zero would hide the bug in a number the
 * customer then pays.
 */
export function computeOrderTotals(
  lines: readonly OrderLineInput[],
  deliveryFeeKobo: Kobo,
  discountKobo: Kobo = 0n,
): OrderTotals {
  if (lines.length === 0) {
    throw new RangeError("An order must have at least one line");
  }

  assertNonNegativeKobo(deliveryFeeKobo, "Delivery fee");
  assertNonNegativeKobo(discountKobo, "Discount");

  const lineTotals = lines.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new RangeError(
        `Order line quantity must be a positive integer, got ${line.quantity}`,
      );
    }
    assertNonNegativeKobo(line.unitPriceKobo, "Unit price");
    return multiplyKobo(line.unitPriceKobo, line.quantity);
  });

  const subtotalKobo = sumKobo(lineTotals);
  const totalKobo = subtotalKobo + deliveryFeeKobo - discountKobo;

  // A discount larger than the order would mean the platform owes the customer
  // cash on delivery, which is not a thing this product does.
  if (totalKobo < 0n) {
    throw new RangeError(
      `Discount ${discountKobo} exceeds the order total ${subtotalKobo + deliveryFeeKobo}`,
    );
  }

  return { subtotalKobo, deliveryFeeKobo, discountKobo, totalKobo };
}

/**
 * Derive expected, collected and outstanding.
 *
 * Payments are not required to be positive. `negateKobo` in the money module
 * documents a negative amount as a reversal or a refund rather than an error,
 * so a reversed payment correctly pushes `outstanding` back up.
 */
export function deriveOrderMoney(
  totalKobo: Kobo,
  payments: readonly PaymentLike[],
): OrderMoney {
  const expectedKobo = totalKobo;
  const collectedKobo = sumKobo(payments.map((payment) => payment.amountKobo));

  return {
    expectedKobo,
    collectedKobo,
    outstandingKobo: expectedKobo - collectedKobo,
  };
}

/**
 * Read a commission rate out of its database representation.
 *
 * `kitchens.commission_rate` is `Decimal(5,4)` — a decimal fraction, not kobo,
 * and zero at launch because kitchens join free. Prisma hands it over as a
 * Decimal object, so the caller stringifies it; this converts that string to
 * integer basis points with no floating point step in between.
 *
 * More than four decimal places is refused rather than truncated. Silently
 * dropping a digit from a rate somebody typed is how a settlement ends up
 * argued about.
 */
export function parseRateToBasisPoints(rate: string): number {
  const cleaned = rate.trim();

  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    throw new TypeError(`Not a commission rate: ${JSON.stringify(rate)}`);
  }

  const [whole = "0", fraction = ""] = cleaned.split(".");

  if (fraction.length > 4) {
    throw new RangeError(
      `Commission rate ${cleaned} has more precision than the four decimal places the column stores`,
    );
  }

  const basisPoints = Number(BigInt(whole) * BASIS_POINT_SCALE) +
    Number(fraction.padEnd(4, "0"));

  if (basisPoints > MAX_BASIS_POINTS) {
    throw new RangeError(
      `Commission rate ${cleaned} is above 100%, which is not a real arrangement`,
    );
  }

  return basisPoints;
}

/**
 * Commission on an amount, at a rate in basis points. Rounds half up.
 *
 * Rounding up rather than down is deliberate: the platform takes the half-kobo,
 * so a long run of orders cannot quietly under-collect through truncation.
 */
export function computeCommission(grossKobo: Kobo, basisPoints: number): Kobo {
  assertNonNegativeKobo(grossKobo, "Gross");

  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > MAX_BASIS_POINTS) {
    throw new RangeError(
      `Basis points must be an integer between 0 and ${MAX_BASIS_POINTS}, got ${basisPoints}`,
    );
  }

  const kobo = BigInt(basisPoints);

  // Half up, done in integers: add half the divisor before dividing.
  return (grossKobo * kobo + BASIS_POINT_SCALE / 2n) / BASIS_POINT_SCALE;
}

export interface SettlementFigures {
  readonly grossKobo: Kobo;
  readonly commissionKobo: Kobo;
  readonly netPayableKobo: Kobo;
}

/**
 * The three figures on a `kitchen_settlements` row. Gross is the sum of the
 * period's order subtotals — not their totals, because the delivery fee is
 * platform revenue and the kitchen never sees it.
 */
export function computeSettlement(input: {
  readonly grossKobo: Kobo;
  readonly basisPoints: number;
}): SettlementFigures {
  const commissionKobo = computeCommission(input.grossKobo, input.basisPoints);

  return {
    grossKobo: input.grossKobo,
    commissionKobo,
    netPayableKobo: input.grossKobo - commissionKobo,
  };
}
