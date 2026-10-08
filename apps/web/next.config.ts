import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The workspace packages ship TypeScript source, so Next has to compile them.
  transpilePackages: ["@kanofood/core", "@kanofood/db", "@kanofood/ui"],
  images: {
    // Kitchen and food images come from object storage, not the filesystem.
    // Remote patterns are added once the storage provider is chosen.
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
