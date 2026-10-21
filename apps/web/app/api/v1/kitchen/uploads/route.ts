import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireActor } from "@/lib/auth/guard";
import { ApiError, failure, ok } from "@/lib/api/http";
import { assertKitchenActive, resolveKitchenMembership } from "@/lib/kitchen/route";
import { loadKitchenMenuItem, setOwnItemImage } from "@/lib/kitchen/menu";
import { setOwnKitchenImage } from "@/lib/kitchen/settings";
import { MAX_UPLOAD_BYTES, identifyImage, storeImage } from "@/lib/storage";

/**
 * `POST /api/v1/kitchen/uploads` — a kitchen's own images.
 *
 * The admin uploader cannot be reused directly: it accepts an `ownerId` from the
 * form and attaches the image to whatever it names. Here the kitchen is the
 * caller's membership, and a dish image is attached only after the dish is
 * confirmed to be on this kitchen's menu, so a valid kitchen login cannot write
 * an image onto another kitchen's record by guessing an id.
 *
 * Multipart, so this does not go through `kitchenRoute`: that pipeline parses
 * JSON. Authentication, membership and the active check still run first, and
 * the response uses the same envelope.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fieldsSchema = z.discriminatedUnion("purpose", [
  z.object({ purpose: z.literal("kitchen-logo") }),
  z.object({ purpose: z.literal("kitchen-cover") }),
  z.object({ purpose: z.literal("menu-item"), ownerId: z.uuid("The dish is missing.") }),
]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const actor = await requireActor(req, ["kitchen_staff"]);
    const membership = await resolveKitchenMembership(actor.userId);
    assertKitchenActive(membership.kitchen);
    const kitchenId = membership.kitchen.id;

    const declared = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + 64 * 1024) {
      throw ApiError.badRequest("That image is larger than the 5 MB limit.");
    }

    const form = await req.formData();
    const parsed = fieldsSchema.safeParse({
      purpose: form.get("purpose"),
      ownerId: form.get("ownerId") ?? undefined,
    });

    if (!parsed.success) {
      throw ApiError.badRequest("An upload needs a purpose, and a dish if it is a dish image.", {
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.map(String).join(".") || "(body)",
          message: issue.message,
        })),
      });
    }

    const file = form.get("file");
    if (!(file instanceof File)) throw ApiError.badRequest("No file was attached.");
    if (file.size === 0) throw ApiError.badRequest("That file is empty.");
    if (file.size > MAX_UPLOAD_BYTES) {
      throw ApiError.badRequest("That image is larger than the 5 MB limit.");
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (!identifyImage(bytes)) {
      throw ApiError.badRequest("That file is not a JPEG, PNG or WebP image.");
    }

    // Ownership before storage, not after: an orphaned object in the bucket is
    // cheaper than a row pointing at another kitchen's image, but both are
    // avoidable by refusing here.
    if (parsed.data.purpose === "menu-item") {
      const item = await loadKitchenMenuItem({ kitchenId, itemId: parsed.data.ownerId });
      if (!item) throw ApiError.notFound("That dish is not on this kitchen's menu.");
    }

    const stored = await storeImage({
      bytes,
      purpose: parsed.data.purpose,
      ownerId: parsed.data.purpose === "menu-item" ? parsed.data.ownerId : kitchenId,
      declaredType: file.type,
    });

    if (parsed.data.purpose === "menu-item") {
      await setOwnItemImage({
        kitchenId,
        itemId: parsed.data.ownerId,
        imageUrl: stored.url,
        actor,
      });
    } else {
      await setOwnKitchenImage({
        kitchenId,
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
