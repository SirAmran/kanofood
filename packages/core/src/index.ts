/**
 * `@kanofood/core` — the domain.
 *
 * Everything here is pure: no database, no network, no clock, no environment.
 * That is what makes the money and lifecycle rules testable without a running
 * system, and PRODUCT_SPEC section 12.1 requires exactly those two paths to be
 * covered by automated tests.
 *
 * The package has no dependencies, and that is a design constraint rather than
 * an accident: ARCHITECTURE section 2 accepts a slow machine, and every
 * dependency competes for the same 4GB.
 */

export * from "./money";
export * from "./order-status";
export * from "./geo";
export * from "./pricing";
export * from "./order-money";
export * from "./reasons";
