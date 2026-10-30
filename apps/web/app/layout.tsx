import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";

import "@kanofood/ui/tokens.css";
import "@kanofood/ui/components.css";
import "./globals.css";

import { brandColours, brandFaviconUrl, brandName, brandTagline } from "@/lib/brand";

const brand = brandName();

/**
 * A deployment can repaint the platform without a code change.
 *
 * `tokens.css` says the brand slots are "overridden at runtime from
 * BRAND_COLOR_PRIMARY and BRAND_COLOR_ACCENT" and, until now, nothing did that:
 * the variables only reached the generated PWA icon. Written as an inline style
 * on `<html>` because `:root` is that element, so a custom property here beats
 * the token file without a cascade fight, and because React escapes it — no
 * hand-built `<style>` string to get wrong.
 */
const colours = brandColours();
const brandStyle = {
  ...(colours.primary ? { "--brand-primary": colours.primary } : {}),
  ...(colours.accent ? { "--brand-accent": colours.accent } : {}),
} as CSSProperties;

/**
 * The favicon and the home-screen icon are files: `app/favicon.ico`,
 * `app/icon.png` and `app/apple-icon.png`. Next's file conventions write the
 * `<link>` tags from them, so there is nothing to state here, which is why
 * `icons` is conditional rather than cosmetic. `BRAND_FAVICON_URL` is the escape
 * hatch for a deployment serving its own face; when it is unset, the committed
 * artwork is the answer and adding an `icons` entry would only duplicate it.
 */
const favicon = brandFaviconUrl();

export const metadata: Metadata = {
  title: {
    default: brand,
    template: `%s | ${brand}`,
  },
  description: brandTagline(),
  applicationName: brand,
  // Served by `app/manifest.webmanifest/route.ts`. Stated rather than left to the
  // file convention so `/kitchen` can point at its own manifest instead of
  // inheriting this one; see `lib/manifests.ts`.
  manifest: "/manifest.webmanifest",
  formatDetection: { telephone: true, address: false, email: false },
  ...(favicon ? { icons: { icon: favicon, shortcut: favicon, apple: favicon } } : {}),
};

export const viewport: Viewport = {  width: "device-width",
  initialScale: 1,
  // Keeps content clear of the home indicator and notch on a phone.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfaf6" },
    { media: "(prefers-color-scheme: dark)", color: "#100d0b" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={brandStyle}>
      <body>{children}</body>
    </html>
  );
}
