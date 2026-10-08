/**
 * Next's server-startup hook.
 *
 * Its only job is to load the repository `.env` on the Node runtime. See
 * `load-root-env.ts` for why that is necessary and why it happens here rather
 * than in `next.config.ts`.
 *
 * The indirection is not tidiness. Next bundles this file for the edge runtime
 * as well, where `node:fs` and `node:path` do not exist, so importing them at
 * the top level here fails the build with "A Node.js module is loaded which is
 * not supported in the Edge Runtime". The dynamic import keeps those modules
 * out of the edge bundle entirely.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadRootEnv } = await import("./load-root-env");
    loadRootEnv();
  }
}
