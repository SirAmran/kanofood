import type { ReactNode } from "react";

/**
 * A crisp line icon per food category.
 *
 * The home category chips used to render an emoji. An emoji is a bitmap from the
 * operating system: it changes shape on every device, sits on a different
 * baseline, and reads as a placeholder next to real type. These are the same
 * 24px stroke drawings the rest of the storefront uses, so a chip, a button and
 * a header icon all look like they came from the same hand.
 *
 * The map is cosmetic and never decides whether a chip renders: an unknown
 * category falls back to a fork and knife.
 */

const DEFAULT_ICON: ReactNode = (
  <>
    <path d="M7 3v6.5a2 2 0 0 0 4 0V3" />
    <path d="M9 9.5V21" />
    <path d="M17 3c-2 1.4-3 3.4-3 5.5 0 1.6.8 2.5 3 2.5v10" />
  </>
);

const ICONS: Readonly<Record<string, ReactNode>> = {
  rice: (
    <>
      <path d="M4 11h16" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M9 7.5c0-1.1 1-1.5 1-2.6M13 7.5c0-1.1 1-1.5 1-2.6" />
    </>
  ),
  grills: (
    <>
      <path d="M12 21a6 6 0 0 0 6-6c0-4-3-5.5-3-9 0 0-3 2-3 5 0-1-1-2-1-2s-5 2.5-5 6a6 6 0 0 0 6 6Z" />
      <path d="M12 18a2.5 2.5 0 0 0 2.5-2.5c0-1.6-1.3-2.3-1.3-3.8" />
    </>
  ),
  grill: (
    <>
      <path d="M12 21a6 6 0 0 0 6-6c0-4-3-5.5-3-9 0 0-3 2-3 5 0-1-1-2-1-2s-5 2.5-5 6a6 6 0 0 0 6 6Z" />
      <path d="M12 18a2.5 2.5 0 0 0 2.5-2.5c0-1.6-1.3-2.3-1.3-3.8" />
    </>
  ),
  suya: (
    <>
      <path d="M12 21a6 6 0 0 0 6-6c0-4-3-5.5-3-9 0 0-3 2-3 5 0-1-1-2-1-2s-5 2.5-5 6a6 6 0 0 0 6 6Z" />
      <path d="M12 18a2.5 2.5 0 0 0 2.5-2.5c0-1.6-1.3-2.3-1.3-3.8" />
    </>
  ),
  soups: (
    <>
      <path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-3Z" />
      <path d="M3 12h18" />
      <path d="M9 8c0-1 1-1.4 1-2.4M13 8c0-1 1-1.4 1-2.4" />
    </>
  ),
  soup: (
    <>
      <path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-3Z" />
      <path d="M3 12h18" />
      <path d="M9 8c0-1 1-1.4 1-2.4M13 8c0-1 1-1.4 1-2.4" />
    </>
  ),
  swallows: (
    <>
      <path d="M4 13h16a8 8 0 0 1-16 0Z" />
      <path d="M7 13c0-3 2.2-5 5-5s5 2 5 5" />
    </>
  ),
  drinks: (
    <>
      <path d="M6 8h12l-1.2 11a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 8Z" />
      <path d="M8 12h8" />
      <path d="M13 8 15 3" />
    </>
  ),
  drink: (
    <>
      <path d="M6 8h12l-1.2 11a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 8Z" />
      <path d="M8 12h8" />
      <path d="M13 8 15 3" />
    </>
  ),
  desserts: (
    <>
      <path d="M4 20h16" />
      <path d="M5 20v-5l7-4 7 4v5" />
      <path d="M12 11V7" />
      <circle cx="12" cy="5.5" r="1.5" />
    </>
  ),
  dessert: (
    <>
      <path d="M4 20h16" />
      <path d="M5 20v-5l7-4 7 4v5" />
      <path d="M12 11V7" />
      <circle cx="12" cy="5.5" r="1.5" />
    </>
  ),
  breakfast: (
    <>
      <path d="M12 4c4 0 7 3.2 7 7.5S16 20 12 20s-7-4.2-7-8.5S8 4 12 4Z" />
      <circle cx="12" cy="11.5" r="2.6" />
    </>
  ),
  pastries: (
    <path d="M3 14c2-4 5-6 9-6s7 2 9 6c-2 .6-3.5.3-5-.8-1.2 1.1-2.6 1.6-4 1.6s-2.8-.5-4-1.6C6.5 14.3 5 14.6 3 14Z" />
  ),
  chicken: (
    <>
      <path d="M15.5 4.5a4.5 4.5 0 0 1 4 4L14 14l-4-4 5.5-5.5Z" />
      <path d="m10 10-5.5 5.5a2.5 2.5 0 0 0 3.5 3.5L13.5 14" />
    </>
  ),
  fish: (
    <>
      <path d="M3 12c3-4 6-6 10-6 3 0 5.5 2 6.5 6-1 4-3.5 6-6.5 6-4 0-7-2-10-6Z" />
      <path d="m20 12 2-3v6l-2-3Z" />
      <circle cx="9" cy="11" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  "fast food": (
    <>
      <path d="M4 10a8 8 0 0 1 16 0H4Z" />
      <path d="M4 13h16" />
      <path d="M4 16h16a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z" />
    </>
  ),
  shawarma: (
    <>
      <path d="M7 3h6l5 5v8a5 5 0 0 1-5 5H8a3 3 0 0 1-3-3V8l2-5Z" />
      <path d="M6 9h11" />
      <path d="M9 13h6" />
    </>
  ),
  snacks: (
    <>
      <path d="M6 9h12l-1 11H7L6 9Z" />
      <path d="M8 9V5l2 4M12 9V4l2 5M16 9V6l2 3" />
    </>
  ),
  salads: (
    <>
      <path d="M4 20c0-8 5-14 16-15-1 11-7 16-15 16" />
      <path d="M5 19c3-4 6-7 10-9" />
    </>
  ),
  salad: (
    <>
      <path d="M4 20c0-8 5-14 16-15-1 11-7 16-15 16" />
      <path d="M5 19c3-4 6-7 10-9" />
    </>
  ),
};

export function CategoryIcon({ name, className }: { readonly name: string; readonly className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name.trim().toLowerCase()] ?? DEFAULT_ICON}
    </svg>
  );
}
