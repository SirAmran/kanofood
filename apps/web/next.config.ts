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
  /**
   * Security headers, Phase 10.
   *
   * HTTPS is the host's job, but HSTS is the part a host cannot know to send:
   * it tells the browser that every later visit is HTTPS before the first
   * request leaves the device. The rest close the cheap defaults a Next app
   * leaves open: MIME sniffing, framing, referrer leakage, and browser features
   * this application never asks for.
   *
   * `geolocation=(self)` rather than `()` is not an oversight. The delivery-point
   * screen has a GPS button, and a policy that denied it would make the button
   * fail silently on a phone. Camera and microphone are genuinely unused.
   *
   * There is no Content-Security-Policy here. A useful one needs a nonce for
   * Next's inline bootstrapping and an allowlist for the OpenStreetMap tiles and
   * the Supabase image host, and Leaflet writes inline styles. Written blind it
   * breaks the maps and is then removed, which is worse than not having it yet.
   * It belongs with a browser-driven test, and this machine has no browser
   * driver. The other headers do not have that risk.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), browsing-topics=()",
          },
        ],
      },
    ];
  },
  images: {
    // Kitchen and food images come from object storage, not the filesystem.
    remotePatterns: hostname
      ? [{ protocol: "https", hostname, pathname: `/storage/v1/object/public/**` }]
      : [],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
