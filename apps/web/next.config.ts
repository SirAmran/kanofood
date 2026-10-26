import type { NextConfig } from "next";

/**
 * The object host, from the configured project URL.
 *
 * Read here rather than hardcoded: the Supabase project ref is in `STORAGE_KEY`
 * and a hardcoded hostname would be one more place a project change has to be
 * remembered. Next loads `.env` before this file is evaluated, so the value is
 * present locally; in a build with no `.env` the pattern list is empty and the
 * build still succeeds, which matters because a build has no reason to need
 * storage.
 */
function storageHostname(): string | null {
  const url = process.env.STORAGE_KEY?.trim();
  if (!url) return null;

  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const hostname = storageHostname();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * Take security patches as they land, not the next time somebody remembers to
   * look. A `next build` stops on an advisory that affects the installed version,
   * and the only thing that clears it is upgrading, so the reminder belongs here
   * rather than in a note nobody reads.
   */
  experimental: { agentUpgrade: "security" },
  // The workspace packages ship TypeScript source, so Next has to compile them.
  transpilePackages: ["@kanofood/core", "@kanofood/db", "@kanofood/ui"],
  /**
   * sharp is a native module and must not be bundled.
   *
   * It is loaded lazily inside `lib/storage.ts`, which is what keeps it off every
   * route that only needs to read an image URL. This is the second half of that:
   * a native binary has to stay a runtime `require` rather than be traced into
   * the server bundle.
   */
  serverExternalPackages: ["sharp"],
  images: {
    // Kitchen and food images come from object storage, not the filesystem.
    remotePatterns: hostname
      ? [{ protocol: "https", hostname, pathname: `/storage/v1/object/public/**` }]
      : [],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
