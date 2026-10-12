import { Prisma, prisma } from "@kanofood/db";

/**
 * The audit trail.
 *
 * `audit_logs` is append-only and holds the entity either side of an
 * administrative change as JSON. Every write an admin makes that is not an order
 * transition goes through here, in the same transaction as the change itself:
 * an audit row without its change, or a change without its audit row, is worse
 * than neither.
 *
 * Order transitions are the one exception, and deliberately so. They already
 * write `order_events`, which is a richer record carrying the status pair, the
 * actor and a reason. Duplicating them here would give two histories of the
 * same thing that can disagree.
 */

export interface AuditInput {
  readonly actorUserId: string;
  readonly actorRole: "admin";
  /** A verb in the past tense: `kitchen.updated`, `rider.suspended`. */
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

/**
 * Anything that can write: the client, or a transaction client inside one.
 *
 * Typed this way so a caller inside `prisma.$transaction` passes `tx` and the
 * audit row commits or rolls back with the change it describes.
 */
export type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

/**
 * JSON columns take `Prisma.JsonNull` rather than `null` for SQL NULL, because
 * the two are different in Prisma's type system and only one of them is what an
 * absent `before` means.
 */
function asJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export async function audit(input: AuditInput, client: AuditClient = prisma): Promise<void> {
  await client.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: asJson(input.before),
      after: asJson(input.after),
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

/**
 * A value as it should be recorded in `before` or `after`.
 *
 * Money is BigInt and JSON is not, so every amount is stringified on the way in.
 * An audit row that threw on a BigInt would be an audit row that is missing
 * exactly when money changed, which is the one case it exists for.
 */
export function snapshot(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    out[key] =
      typeof item === "bigint"
        ? item.toString()
        : item instanceof Date
          ? item.toISOString()
          : item === undefined
            ? null
            : item;
  }

  return out;
}
