"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Alert, Upload, useToast, type UploadResult } from "@kanofood/ui";

/**
 * An image field.
 *
 * The upload route stores the object *and* attaches it to the record in one
 * request, so there is nothing to do on success but say so and pull the page
 * again. That is deliberate: the version where the browser uploads and then a
 * second call writes the URL is the version where the second call fails and the
 * database is pointing at an image nobody can see, or an image is stored that
 * nothing references.
 *
 * Which record it attaches to is `ownerId` plus `purpose`, both form fields, and
 * the route refuses an upload without them. This component is only used where
 * the record already exists, because an image needs something to belong to.
 */
export interface AdminUploadProps {
  /** `kitchen-logo`, `kitchen-cover` or `menu-item`. */
  readonly purpose: "kitchen-logo" | "kitchen-cover" | "menu-item";
  readonly ownerId: string;
  readonly label?: string;
  readonly hint?: string;
  /** Shown as a toast once the server has stored and attached the image. */
  readonly successMessage?: string;
}

export function AdminUpload({
  purpose,
  ownerId,
  label = "Upload an image",
  hint = "JPEG, PNG or WebP, up to 5 MB. It is resized on the server.",
  successMessage = "Image updated.",
}: AdminUploadProps) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  // The fields object is part of the request the component builds, so it has to
  // hold still between renders or every keystroke elsewhere on the page would
  // rebuild the uploader mid-flight.
  const fields = { purpose, ownerId };

  const onUploaded = useCallback(
    (_result: UploadResult) => {
      setError(null);
      toast?.push(successMessage);
      router.refresh();
    },
    [router, successMessage, toast],
  );

  return (
    <div>
      <Upload
        endpoint="/api/v1/admin/uploads"
        fields={fields}
        label={label}
        hint={hint}
        onUploaded={onUploaded}
        onError={(message) => setError(message)}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
