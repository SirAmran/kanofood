import { brandMark } from "@/lib/brand-icon";

/**
 * `apple-touch-icon`, generated from the same mark as the manifest icons.
 *
 * iOS ignores a manifest's `icons` when a site is added to the home screen and
 * uses this instead. Without it the phone puts a screenshot of the page on the
 * home screen, which is the face the manifest comment was worried about. Since
 * iOS only delivers Web Push to a site added to the home screen, this file is
 * part of what makes push work on an iPhone at all.
 *
 * 180px is Apple's own size. The convention wires the `<link rel="apple-touch-icon">`
 * into the document, so there is no hand-written tag to keep in step.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return brandMark(180);
}
