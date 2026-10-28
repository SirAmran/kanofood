/**
 * The restore drill. Phase 10, docs/ARCHITECTURE.md section 10.
 *
 * "A restore must be actually performed once before launch. An untested backup
 * is not a backup." The restore itself happens in the database provider's
 * dashboard: point-in-time recovery into a scratch project. This script is the
 * part that makes the result checkable instead of a feeling.
 *
 *   RESTORE_SOURCE_URL=<production direct URL> \
 *   RESTORE_TARGET_URL=<restored scratch URL> \
 *   npm run db:restore-drill
 *
 * It reads both databases and compares four things: the table list, the schema
 * fingerprint (columns, indexes and constraints), the latest applied migration,
 * and the row count of every table. It fails on any difference. Both connections
 * are read-only in practice; this script contains no write and no DDL.
 *
 * Run it while nothing is writing, or immediately after the restore point. The
 * source keeps moving, and a restore is a photograph of one moment: comparing it
 * to a database that took orders for another ten minutes will report differences
 * that are not restore failures. `docs/DEPLOYMENT.md` describes the drill.
 */

import { createHash } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const sourceUrl =
  process.env.RESTORE_SOURCE_URL?.trim() ||
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  null;
const targetUrl = process.env.RESTORE_TARGET_URL?.trim() || null;

if (!sourceUrl) {
  console.error(
    "RESTORE_SOURCE_URL, DIRECT_URL and DATABASE_URL are all unset. The drill has nothing to compare against.",
  );
  process.exit(1);
}
if (!targetUrl) {
  console.error(
    "RESTORE_TARGET_URL is not set. Point it at the database restored from the backup, never at production.",
  );
  process.exit(1);
}
if (sourceUrl === targetUrl) {
  console.error(
    "RESTORE_SOURCE_URL and RESTORE_TARGET_URL are the same connection. That compares a database with itself.",
  );
  process.exit(1);
}

type ColumnRow = {
  table_name: string;
  column_name: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
};

type IndexRow = {
  tablename: string;
  indexdef: string;
};

type ConstraintRow = {
  relation: string;
  definition: string;
};

type MigrationRow = {
  migration_name: string;
  checksum: string;
};

type CountRow = {
  count: bigint;
};

type Snapshot = {
  tables: string[];
  schemaHash: string;
  migration: string;
  counts: Map<string, bigint>;
};

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function snapshot(client: PrismaClient): Promise<Snapshot> {
  const tableRows = await client.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  const tables = tableRows.map((row) => row.table_name);

  const columns = await client.$queryRaw<ColumnRow[]>`
    SELECT table_name, column_name, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `;

  const indexes = await client.$queryRaw<IndexRow[]>`
    SELECT tablename, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `;

  const constraints = await client.$queryRaw<ConstraintRow[]>`
    SELECT conrelid::regclass::text AS relation, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
    ORDER BY relation, definition
  `;

  const fingerprint = [
    ...columns.map(
      (column) =>
        `column ${column.table_name}.${column.column_name}:${column.udt_name}:${column.is_nullable}:${column.column_default ?? ""}`,
    ),
    ...indexes.map((index) => `index ${index.tablename}: ${index.indexdef}`),
    ...constraints.map(
      (constraint) => `constraint ${constraint.relation}: ${constraint.definition}`,
    ),
  ].join("\n");

  const migrations = await client.$queryRaw<MigrationRow[]>`
    SELECT migration_name, checksum
    FROM _prisma_migrations
    WHERE finished_at IS NOT NULL
    ORDER BY started_at DESC
    LIMIT 1
  `;
  const latest = migrations[0];
  if (!latest) {
    throw new Error("the database has no finished migration in _prisma_migrations");
  }

  const counts = new Map<string, bigint>();
  for (const table of tables) {
    const rows = await client.$queryRawUnsafe<CountRow[]>(
      `SELECT count(*)::bigint AS count FROM ${quoteIdentifier(table)}`,
    );
    counts.set(table, rows[0]?.count ?? 0n);
  }

  return {
    tables,
    schemaHash: createHash("sha256").update(fingerprint).digest("hex"),
    migration: `${latest.migration_name}:${latest.checksum}`,
    counts,
  };
}

function connect(url: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      max: 1,
      connectionTimeoutMillis: 15_000,
      allowExitOnIdle: true,
    }),
  });
}

const source = connect(sourceUrl);
const target = connect(targetUrl);

try {
  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    snapshot(source),
    snapshot(target),
  ]);

  const schemaMatches =
    sourceSnapshot.schemaHash === targetSnapshot.schemaHash;
  const migrationMatches =
    sourceSnapshot.migration === targetSnapshot.migration;

  const allTables = [
    ...new Set([...sourceSnapshot.tables, ...targetSnapshot.tables]),
  ].sort();

  const countDiffs: string[] = [];
  for (const table of allTables) {
    const sourceCount = sourceSnapshot.counts.get(table);
    const targetCount = targetSnapshot.counts.get(table);

    if (sourceCount === undefined) {
      countDiffs.push(`${table}: missing from source, target has ${targetCount ?? 0}`);
      continue;
    }
    if (targetCount === undefined) {
      countDiffs.push(`${table}: missing from target, source has ${sourceCount}`);
      continue;
    }
    if (sourceCount !== targetCount) {
      countDiffs.push(`${table}: source ${sourceCount}, target ${targetCount}`);
    }
  }

  console.log("Restore drill");
  console.log(`  tables        ${sourceSnapshot.tables.length} source, ${targetSnapshot.tables.length} target`);
  console.log(
    `  schema        ${schemaMatches ? "match" : "DIFFERENT"} (${sourceSnapshot.schemaHash.slice(0, 12)} / ${targetSnapshot.schemaHash.slice(0, 12)})`,
  );
  console.log(
    `  migration     ${migrationMatches ? "match" : "DIFFERENT"} (${sourceSnapshot.migration.split(":")[0]} / ${targetSnapshot.migration.split(":")[0]})`,
  );
  console.log(`  rows          ${countDiffs.length === 0 ? "match" : `${countDiffs.length} difference(s)`}`);

  for (const difference of countDiffs) {
    console.log(`    - ${difference}`);
  }

  const passed = schemaMatches && migrationMatches && countDiffs.length === 0;
  console.log(`\n${passed ? "PASSED" : "FAILED"}: ${passed ? "the restore is complete and usable." : "the restore is not an exact copy."}`);

  process.exitCode = passed ? 0 : 1;
} catch (error) {
  console.error(
    "Restore drill could not run:",
    error instanceof Error ? error.message : "unknown error",
  );
  process.exitCode = 1;
} finally {
  await Promise.allSettled([source.$disconnect(), target.$disconnect()]);
}
