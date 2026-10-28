import { randomUUID } from "node:crypto";

import { ApiError } from "./api/http";
import { storageProjectUrl, storageProvider, storageServiceKey } from "./env";

/**
 * Object storage. ARCHITECTURE.md section 9.
 *
 * Kitchen and food images go to Supabase Storage, not the filesystem and not the
 * database. This module is the application half of section 9, which was left to
 * Phase 5: content validation, re-encoding, thumbnails, the fallback image, and
 * deletion that removes the object rather than only the row.
 *
 * **No Supabase SDK.** The four calls this needs are four URLs, and the SDK
 * would be a large dependency added to a machine where an install has taken
 * thirty-five minutes. The REST surface is stable, documented, and the same
 * endpoints the SDK calls.
 *
 * **A UUID in the path is load-bearing.** Section 9: Supabase serves public
 * objects through an edge cache, so a deleted or replaced object can keep
 * answering at the same URL for a short window. A fresh path per upload
 * sidesteps it. Section 9's own example writes `kitchens/<id>/logo.webp`, which
 * would be the same path every time; the rule it states and the example it gives
 * disagree, and the rule wins. Every upload here gets a fresh UUID, and the
 * object it replaces is deleted afterwards.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BUCKET = "media";

/** Section 9: 5 MB, and JPEG, PNG and WebP only. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Longest edge of a stored image. Larger than any place one is displayed. */
const MAX_DIMENSION = 1600;

/** Longest edge of a thumbnail, for a menu list. */
const THUMB_DIMENSION = 400;

/**
 * What a kitchen with no image shows.
 *
 * A file in this application's own `public` folder rather than an object in the
 * bucket. A fallback that lives in the bucket is a fallback that is missing when
 * the bucket is the thing that is broken, and this one has to work offline.
 */
export const FALLBACK_KITCHEN_IMAGE = "/images/kitchen-placeholder.svg";
export const FALLBACK_MENU_IMAGE = "/images/dish-placeholder.svg";

function storageUrl(): string {
  return storageProjectUrl();
}

function storageKey(): string {
  return storageServiceKey();
}

/**
 * The headers Supabase Storage accepts.
 *
 * **`apikey`, not `Authorization: Bearer`.** Verified against the live project
 * on 2026-10-11: the Storage service validates the `Authorization` header as a
 * JWT and rejects the current-format secret key with `Invalid Compact JWS`
 * (`sb_secret_...` is not a JWS). The same key sent as `apikey` is accepted. The
 * SDK hides this by choosing the header for you; calling the REST surface
 * directly means choosing it here, and choosing it wrong is a 403 that reads
 * like a bad key.
 *
 * The key is the service role. It is server side only, and the bucket has no
 * write policy, so the publishable key a browser holds cannot write regardless.
 */
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: storageKey(), ...extra };
}

function assertProvider(): void {
  const provider = storageProvider();
  if (provider !== "supabase") {
    throw new Error(
      `STORAGE_PROVIDER is "${provider}" and only "supabase" is implemented. See docs/ARCHITECTURE.md section 9.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ImageKind {
  readonly mime: "image/jpeg" | "image/png" | "image/webp";
  readonly extension: "jpg" | "png" | "webp";
}

/**
 * Identify an image from its first bytes.
 *
 * Section 9 requires validation by magic bytes and not by file extension, and
 * the reason is that the extension and the declared content type are both
 * attacker-controlled: a `.png` that is an HTML document, or a `Content-Type:
 * image/png` on a file that is not, are both one line of curl away. The bytes
 * are not.
 *
 * Returns null for anything unrecognised, including SVG. SVG is deliberately
 * absent: it is a document format that can carry script, and a public bucket
 * serving one is stored cross-site scripting with extra steps.
 */
export function identifyImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (PNG.every((byte, index) => bytes[index] === byte)) {
    return { mime: "image/png", extension: "png" };
  }

  // WebP: "RIFF" .... "WEBP"
  const RIFF = [0x52, 0x49, 0x46, 0x46];
  const WEBP = [0x57, 0x45, 0x42, 0x50];
  if (
    RIFF.every((byte, index) => bytes[index] === byte) &&
    WEBP.every((byte, index) => bytes[8 + index] === byte)
  ) {
    return { mime: "image/webp", extension: "webp" };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Uploading
// ---------------------------------------------------------------------------

export type UploadPurpose = "kitchen-logo" | "kitchen-cover" | "menu-item" | "featured-card";

export interface StoredImage {
  /** The full-size object's public URL. */
  readonly url: string;
  /** The thumbnail's public URL, for list rows. */
  readonly thumbUrl: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
}

function publicUrl(path: string): string {
  return `${storageUrl()}/storage/v1/object/public/${BUCKET}/${path}`;
}

/**
 * The object path inside a public URL, or null if the URL is not one of ours.
 *
 * Needed because the columns store a URL, not a path, and deletion addresses an
 * object by path. Returning null for a foreign URL is what stops a query-string
 * or a hand-edited column from turning into a delete against some other service.
 */
export function pathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;

  const path = url.slice(index + marker.length).split("?")[0] ?? "";
  return path === "" ? null : decodeURIComponent(path);
}

/**
 * Re-encode, resize, thumbnail and store.
 *
 * Four things happen to the bytes before they are stored, and each is section 9:
 *
 *   1. **Magic bytes decide what it is.** The declared MIME type only has to
 *      agree; it is never what authorises the upload.
 *   2. **The size is checked before the bytes are read** by the caller, against
 *      `Content-Length`, so an oversized body is refused without being buffered.
 *      The check is repeated here on the buffer, because a chunked request
 *      carries no length.
 *   3. **sharp re-encodes to WebP.** A re-encode is not a resize: it is what
 *      removes a polyglot file, a trailing payload appended to a valid image, and
 *      the EXIF block. Dropping EXIF also drops the GPS coordinates of wherever
 *      the photograph was taken, which a kitchen has not consented to publish.
 *      `rotate()` with no argument applies EXIF orientation first, so a phone
 *      photo does not arrive sideways once the EXIF is gone.
 *   4. **A thumbnail is generated** at 400px so a menu list does not download a
 *      1600px image per row.
 */
export async function storeImage(input: {
  readonly bytes: Buffer;
  readonly purpose: UploadPurpose;
  /** The kitchen or menu item the image belongs to, for the path. */
  readonly ownerId: string;
  /** The content type the caller declared. Checked, never trusted. */
  readonly declaredType?: string | null;
}): Promise<StoredImage> {
  assertProvider();

  if (input.bytes.length > MAX_UPLOAD_BYTES) {
    throw ApiError.badRequest(
      `That image is ${(input.bytes.length / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`,
    );
  }

  const kind = identifyImage(input.bytes);
  if (!kind) {
    throw ApiError.badRequest("That file is not a JPEG, PNG or WebP image.");
  }

  if (input.declaredType && !input.declaredType.toLowerCase().startsWith(kind.mime)) {
    throw ApiError.badRequest(
      `The file says it is ${input.declaredType} but its contents are ${kind.mime}. Refused.`,
    );
  }

  // Imported here rather than at module scope. sharp is a native module, and a
  // top-level import would load it on every route that touches this file,
  // including the ones that only want `pathFromPublicUrl`.
  const sharp = (await import("sharp")).default;

  const full = await sharp(input.bytes, { failOn: "error" })
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const thumb = await sharp(input.bytes, { failOn: "error" })
    .rotate()
    .resize({ width: THUMB_DIMENSION, height: THUMB_DIMENSION, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  const folder =
    input.purpose === "menu-item" ? "menu-items" : input.purpose === "featured-card" ? "featured" : "kitchens";
  const token = randomUUID();
  const base = `${folder}/${input.ownerId}/${input.purpose}-${token}`;

  await put(`${base}.webp`, full.data);
  await put(`${base}-thumb.webp`, thumb);

  return {
    url: publicUrl(`${base}.webp`),
    thumbUrl: publicUrl(`${base}-thumb.webp`),
    width: full.info.width,
    height: full.info.height,
    bytes: full.info.size,
  };
}

async function put(path: string, body: Buffer): Promise<void> {
  const response = await fetch(`${storageUrl()}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: authHeaders({
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
      // Never overwrite. The path carries a UUID, so a collision means something
      // is wrong rather than something is being updated.
      "x-upsert": "false",
    }),
    body: new Uint8Array(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Storage refused the upload (${response.status}). ${detail.slice(0, 200)}`);
  }
}

/**
 * Remove an object, given its public URL.
 *
 * Never throws. Every caller is deleting a database row that is already gone, or
 * replacing an image that has already been replaced, and a storage failure at
 * that point must not turn a completed delete into a 500. An object left behind
 * costs a few kilobytes; a lying error message costs somebody an hour. The
 * failure is logged with enough detail to find the object by hand.
 */
export async function deleteObject(url: string, context: string): Promise<void> {
  try {
    const path = pathFromPublicUrl(url);
    if (!path) return;

    // A stored image is two objects: the full size and the thumbnail, which are
    // the same path with a suffix. Both go.
    const paths = [path];
    if (!path.includes("-thumb.")) {
      paths.push(path.replace(/\.webp$/, "-thumb.webp"));
    }

    const response = await fetch(`${storageUrl()}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ prefixes: paths }),
    });

    if (!response.ok) {
      console.error(`[storage] could not delete the ${context}: ${response.status} ${path}`);
    }
  } catch (error) {
    console.error(`[storage] could not delete the ${context}`, error);
  }
}

/** Whether the bucket answers. Used by the health check, not by a page. */
export async function storageReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${storageUrl()}/storage/v1/bucket/${BUCKET}`, {
      headers: authHeaders(),
    });
    return response.ok;
  } catch {
    return false;
  }
}
