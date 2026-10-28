/**
 * Prisma 7 configuration.
 *
 * Prisma 7 removed `url` and `directUrl` from the datasource block in
 * schema.prisma. Migration and introspection commands now take their connection
 * from here, so this file replaces those two lines.
 *
 * The URL is DIRECT_URL: the unpooled session connection. `prisma migrate dev`
 * needs a session that can hold a transaction open and create the shadow
 * database, which the transaction pooler cannot do. The application at runtime
 * uses the pooled DATABASE_URL instead, through the driver adapter in
 * src/index.ts. That split is deliberate and is the hazard ARCHITECTURE.md
 * section 10 names.
 *
 * .env lives at the repository root, two levels up. Prisma no longer loads it
 * for us, so it is loaded explicitly here. Absence is not an error: CI and
 * Netlify supply the variables through the environment.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageRoot, "..", "..");

try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // No .env on disk. The variables are expected to be in the environment.
}

/**
 * The unpooled connection, when this process has been given one.
 *
 * `prisma generate` runs from the root `postinstall`, so it runs on a host that
 * has been connected to the repository but not yet given credentials. Generate
 * reads the schema and never opens a connection, but `env("DIRECT_URL")` is
 * resolved while this file loads, so requiring it here would fail the install
 * on exactly that host and take the build down before Next.js starts.
 *
 * An absent URL leaves the datasource undefined rather than falling back to a
 * placeholder: a placeholder would quietly point a migration at nothing, while
 * an undefined datasource makes `migrate`, `studio` and `db pull` fail on their
 * own with a message about the missing connection. Generate is the one command
 * that has no reason to care.
 */
const directUrl = process.env.DIRECT_URL?.trim();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npm run seed",
  },
  ...(directUrl ? { datasource: { url: directUrl } } : {}),
});
