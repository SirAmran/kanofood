/**
 * How a kitchen gets paid. PRODUCT_SPEC section 10.2, and the `model` column on
 * `kitchen_settlements`.
 *
 * The two arrangements, in the words of the spec:
 *
 * - **Model A.** The customer pays the rider on delivery. The platform then owes
 *   the kitchen its share, and a settlement is a payout going out.
 * - **Model B.** The platform pays the kitchen upfront. The platform then
 *   collects from the customer, and the risk of a failed collection is the
 *   platform's.
 *
 * This is data, not a code branch. Nothing in this codebase switches behaviour
 * on the model: it is recorded on each settlement because the two arrangements
 * mean the same three figures have different meanings, and somebody reading a
 * settlement back in six months needs to know which one they are looking at.
 *
 * A kitchen has no default model column. Every settlement carries its own, which
 * means an operator can settle one kitchen under A and another under B, but also
 * means the model is a per-settlement choice rather than a per-kitchen setting.
 * That is recorded with the other spec gaps.
 */

export const SETTLEMENT_MODELS = ["model_a", "model_b"] as const;

export type SettlementModel = (typeof SETTLEMENT_MODELS)[number];

export const SETTLEMENT_MODEL_LABELS: Readonly<Record<SettlementModel, string>> = {
  model_a: "Model A. Customer pays the rider, platform pays the kitchen after",
  model_b: "Model B. Platform pays the kitchen upfront, platform collects",
};

export const SETTLEMENT_MODEL_SHORT: Readonly<Record<SettlementModel, string>> = {
  model_a: "Model A",
  model_b: "Model B",
};

export function isSettlementModel(value: unknown): value is SettlementModel {
  return typeof value === "string" && (SETTLEMENT_MODELS as readonly string[]).includes(value);
}

export function settlementModelLabel(model: SettlementModel): string {
  return SETTLEMENT_MODEL_LABELS[model];
}
