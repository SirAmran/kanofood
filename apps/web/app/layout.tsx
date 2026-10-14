import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@kanofood/ui/tokens.css";
import "@kanofood/ui/components.css";
import "./globals.css";

/**
 * An empty environment variable is not a configured one.
 *
 * `.env.example` ships `BRAND_NAME=` with nothing after it, and `??` falls back
 * only on null and undefined — so the empty string won, and every page title
 * rendered `Dashboard | ` with a dangling pipe. Blank is treated as absent here
 * rather than by filling the value into `.env`, because the next person to copy
 * `.env.example` would put it straight back.
 */
function configured(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

const brand = configured(process.env.BRAND_NAME, "KanoFood");

export const metadata: Metadata = {
  title: {
    default: brand,
    template: `%s | ${brand}`,
  },
  description: configured(process.env.BRAND_TAGLINE, "Food delivery in Kano Metropolitan."),
  applicationName: brand,
  formatDetection: { telephone: true, address: false, email: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Keeps content clear of the home indicator and notch on a phone.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0f11" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
