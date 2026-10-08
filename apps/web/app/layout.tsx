import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@kanofood/ui/tokens.css";
import "./globals.css";

const brand = process.env.BRAND_NAME ?? "KanoFood";

export const metadata: Metadata = {
  title: {
    default: brand,
    template: `%s | ${brand}`,
  },
  description: process.env.BRAND_TAGLINE ?? "Food delivery in Kano Metropolitan.",
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
