import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Loads the repository's `.env` into the server process.
 *
 * Why this exists: Next loads environment files from the application directory
 * only, and never walks up to a monorepo root. So `apps/web` sees none of the
 * repository `.env` that holds `DATABASE_URL`, the auth secrets and the storage
 * credentials. Verified against Next's own source, where every `loadEnvConfig`
 * call site is passed the app directory, and confirmed empirically, where Next's
 * loader returned `loadedEnvFiles: []` for this app with every expected key
 * absent.
 *
 * Why not `next.config.ts`: that file is evaluated in a child process, so
 * anything it sets on `process.env` dies with the process that evaluated it.
 * Proved by doing exactly that and watching a route handler report every key
 * absent. `register()` runs in the server process itself, before it serves a
 * request, which is the earliest point that reaches route handlers.
 *
 * Why not a second `.env` inside `apps/web`: two copies of the same secrets
 * drift. Why not a symlink to the root file: creating one on Windows needs
 * elevation or Developer Mode, so it would not survive a fresh clone.
 *
 * This module is imported dynamically from `instrumentation.ts` and is never
 * reachable from the edge runtime, which is why it may import `node:` builtins.
 *
 * Absence is not an error, because CI and the host supply the variables through
 * the environment. Nothing here is logged either: a value would end up in a
 * build log or a transcript.
 */

/** Walks up to the workspace root rather than assuming a fixed depth. */
function findWorkspaceRoot(start: string): string | undefined {
  let dir = start;

  for (;;) {
    const manifest = path.join(dir, "package.json");
    if (existsSync(manifest)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
        if (typeof parsed === "object" && parsed !== null && "workspaces" in parsed) {
          return dir;
        }
      } catch {
        // A package.json that will not parse is not the workspace root.
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function loadRootEnv(): void {
  const root = findWorkspaceRoot(process.cwd());
  if (!root) return;

  const envFile = path.join(root, ".env");
  if (!existsSync(envFile)) return;

  try {
    process.loadEnvFile(envFile);
  } catch {
    // A malformed .env must not take the server down. The variables stay
    // absent, and the first route that needs one fails with its own message.
  }
}
