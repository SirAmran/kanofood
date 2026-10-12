import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireActor } from "@/lib/auth/guard";
import { ApiError, failure, ok } from "@/lib/api/http";
import { setKitchenImage } from "@/lib/admin/kitchens";
import { setMenuItemImage } from "@/lib/admin/menu";
import { MAX_UPLOAD_BYTES, identifyImage, storeImage, type UploadPurpose } from "@/lib/storage";

/**
 * `POST /api/v1/admin/uploads` — the one way an image enters the system.
 *
 * Multipart, so it does not go through `staffRoute`: that pipeline parses a JSON
 * body, and a file is not JSON. Authentication and authorisation still happen
 * first and in that order, and the response shape is the same envelope.
 *
 * The upload stores the object *and* attaches it. One round trip, one audit
 * entry, and no window in which an orphaned object exists because the second
 * request never came.
 */

export const dynamic = "force-dynamic";

/** No body is parsed, so the only thing to declare is the runtime. */
export const runtime = "nodejs";

const PURPOSES: readonly UploadPurpose[] = ["kitchen-logo", "kitchen-cover", "menu-item"];

const fieldsSchema = z.object({
  purpose: z.enum(PURPOSES as unknown as [UploadPurpose, ...UploadPurpose[]]),
  ownerId: z.uuid(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const actor = await requireActor(req, ["admin"]);

    /**
     * Section 9: the size limit is enforced before the bytes are read.
     *
     * `Content-Length` is a claim by the caller, so this is a cheap refusal of an
     * obviously oversized upload rather than a guarantee, and `storeImage`
     * checks the real buffer again. What it buys is not buffering 200 MB into
     * the memory of a 4 GB machine before deciding to say no.
     */
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + 64 * 1024) {
      throw ApiError.badRequest("That image is larger than the 5 MB limit.");
    }

    const form = await req.formData();
    const parsed = fieldsSchema.safeParse({
      purpose: form.get("purpose"),
      ownerId: form.get("ownerId"),
    });

    if (!parsed.success) {
      throw ApiError.badRequest("An upload needs a purpose and the record it belongs to.", {
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.map(String).join(".") || "(body)",
          message: issue.message,
        })),
      });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw ApiError.badRequest("No file was attached.");
    }
    if (file.size === 0) {
      throw ApiError.badRequest("That file is empty.");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw ApiError.badRequest("That image is larger than the 5 MB limit.");
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    // Checked here as well as inside `storeImage`, so a file that is the wrong
    // sort never reaches the encoder. A rejection from sharp reads as "input
    // buffer contains unsupported image format", which is a worse message than
    // the one below and arrives after the work.
    if (!identifyImage(bytes)) {
      throw ApiError.badRequest("That file is not a JPEG, PNG or WebP image.");
    }

    const stored = await storeImage({
      bytes,
      purpose: parsed.data.purpose,
      ownerId: parsed.data.ownerId,
      declaredType: file.type,
    });

    // Thumbnails are not stored on any row: every image is addressed by its full
    // URL, and the thumbnail is the same path with a suffix. The URL is derived
    // rather than looked up so replacing an image cannot leave a row pointing at
    // the previous thumbnail.
    if (parsed.data.purpose === "menu-item") {
      await setMenuItemImage({ itemId: parsed.data.ownerId, imageUrl: stored.url, actor });
    } else {
      await setKitchenImage({
        kitchenId: parsed.data.ownerId,
        kind: parsed.data.purpose === "kitchen-logo" ? "logo" : "cover",
        url: stored.url,
        actor,
      });
    }

    return ok({
      url: stored.url,
      thumbUrl: stored.thumbUrl,
      width: stored.width,
      height: stored.height,
      bytes: stored.bytes,
    });
  } catch (error) {
    return failure(error);
  }
}
