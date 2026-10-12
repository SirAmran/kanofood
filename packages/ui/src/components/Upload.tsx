"use client";

import { useCallback, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";

import { cn } from "../cn";

/**
 * Upload.
 *
 * One file, posted to one endpoint, with real progress.
 *
 * `XMLHttpRequest` rather than `fetch`, and that is not nostalgia: `fetch` still
 * cannot report upload progress, and a menu photo on a phone on a poor
 * connection is exactly the case where a progress bar is the difference between
 * waiting and giving up. The request is abortable for the same reason.
 *
 * The endpoint answers in the application's standard envelope, `{ok, data}`, and
 * the server has already validated, re-encoded, resized and thumbnailed the file
 * by the time it replies, per ARCHITECTURE section 9. This component does not
 * decide whether an upload is allowed; it posts the bytes and reports what came
 * back.
 */

export interface UploadResult {
  readonly url: string;
  /** Present when the server produced one. */
  readonly thumbUrl?: string;
  readonly width?: number;
  readonly height?: number;
  readonly bytes?: number;
}

export interface UploadProps {
  /** Where to post the file. The route does the validating, not this component. */
  readonly endpoint: string;
  /** Called once the server has stored the file and answered with its URL. */
  readonly onUploaded: (result: UploadResult) => void;
  readonly onError?: (message: string) => void;
  /** Extra form fields sent alongside the file: a purpose, an owner id. */
  readonly fields?: Readonly<Record<string, string>>;
  readonly accept?: string;
  readonly label?: string;
  readonly hint?: ReactNode;
  readonly disabled?: boolean;
  readonly className?: string;
}

interface ProgressState {
  readonly loaded: number;
  readonly total: number;
}

/** What the upload route returns inside the envelope. */
interface UploadPayload {
  readonly url?: string;
  readonly thumbUrl?: string;
  readonly width?: number;
  readonly height?: number;
  readonly bytes?: number;
}

export function Upload({
  endpoint,
  onUploaded,
  onError,
  fields,
  accept = "image/png,image/jpeg,image/webp",
  label = "Upload an image",
  hint,
  disabled = false,
  className,
}: UploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<XMLHttpRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);

  const reset = useCallback(() => {
    setBusy(false);
    setProgress(null);
    requestRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const send = useCallback(
    (file: File) => {
      setBusy(true);
      setProgress({ loaded: 0, total: file.size });

      const body = new FormData();
      body.append("file", file);
      for (const [name, value] of Object.entries(fields ?? {})) body.append(name, value);

      const request = new XMLHttpRequest();
      requestRef.current = request;
      request.open("POST", endpoint);
      request.responseType = "json";

      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          setProgress({ loaded: event.loaded, total: event.total });
        }
      });

      request.addEventListener("load", () => {
        const envelope = request.response as
          | { ok?: boolean; data?: UploadPayload; error?: { message?: string } }
          | null;

        const payload = envelope?.data;

        if (request.status >= 200 && request.status < 300 && envelope?.ok && payload?.url) {
          onUploaded({
            url: payload.url,
            ...(payload.thumbUrl !== undefined ? { thumbUrl: payload.thumbUrl } : {}),
            ...(payload.width !== undefined ? { width: payload.width } : {}),
            ...(payload.height !== undefined ? { height: payload.height } : {}),
            ...(payload.bytes !== undefined ? { bytes: payload.bytes } : {}),
          });
          reset();
          return;
        }

        onError?.(envelope?.error?.message ?? "That upload did not go through.");
        reset();
      });

      request.addEventListener("error", () => {
        onError?.("That upload did not go through. Check the connection and try again.");
        reset();
      });

      request.addEventListener("abort", reset);

      request.send(body);
    },
    [endpoint, fields, onError, onUploaded, reset],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.item(0);
      if (!file || busy || disabled) return;
      send(file);
    },
    [busy, disabled, send],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setDragging(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles],
  );

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => handleFiles(event.target.files),
    [handleFiles],
  );

  const percent = progress && progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0;

  return (
    <div className={cn("kf-stack", "kf-stack--tight", className)}>
      <label
        className={cn("kf-drop", (busy || disabled) && "kf-drop--busy")}
        data-dragging={dragging || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={onChange}
          disabled={disabled || busy}
          aria-label={typeof label === "string" ? label : undefined}
        />
        <span className="kf-list__title">{busy ? "Uploading" : label}</span>
        {hint && !busy ? <span className="kf-hint">{hint}</span> : null}
      </label>

      {busy ? (
        <div className="kf-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="kf-progress__bar" style={{ width: `${String(percent)}%` }} />
        </div>
      ) : null}

      {busy ? (
        <button
          type="button"
          className="kf-btn kf-btn--ghost kf-btn--sm"
          onClick={() => requestRef.current?.abort()}
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
}
