import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * Avatar and media.
 *
 * The avatar falls back to initials rather than to a generic silhouette,
 * because a name that is already on the page is better than an anonymous
 * outline, and it costs nothing to render.
 */

export interface AvatarProps {
  readonly name: string;
  readonly src?: string | null;
  readonly large?: boolean;
  readonly className?: string;
}

/** Up to two initials from a name. Falls back to a question mark for an empty one. */
export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) return "?";

  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";

  return `${first}${last}`.toUpperCase() || "?";
}

export function Avatar({ name, src, large = false, className }: AvatarProps) {
  return (
    <span className={cn("kf-avatar", large && "kf-avatar--lg", className)} title={name}>
      {src ? <img src={src} alt="" /> : initials(name)}
    </span>
  );
}

export interface MediaProps {
  /** A URL, or null while the row has no image yet. */
  readonly src?: string | null;
  readonly alt: string;
  readonly shape?: "square" | "wide" | "thumb";
  readonly className?: string;
  /** Rendered instead of the image when there is none. */
  readonly fallback?: ReactNode;
  /** Above-the-fold images should not be lazy. */
  readonly priority?: boolean;
  /** Renders the image; pass `next/image` so the optimizer is used. */
  readonly renderImage?: (props: {
    src: string;
    alt: string;
    fill: true;
    sizes: string;
    priority: boolean;
    style: { objectFit: "cover" };
  }) => ReactNode;
}

const SIZES: Record<NonNullable<MediaProps["shape"]>, string> = {
  square: "(max-width: 640px) 40vw, 200px",
  wide: "(max-width: 640px) 100vw, 420px",
  thumb: "56px",
};

/**
 * A fixed aspect box. The image sits absolutely inside it so nothing on the
 * page moves when the image arrives, which is the layout-shift rule in
 * UX_SPEC section 3.
 */
export function Media({
  src,
  alt,
  shape = "square",
  className,
  fallback,
  priority = false,
  renderImage,
}: MediaProps) {
  const classes = cn("kf-media", `kf-media--${shape}`, className);

  if (!src) {
    return (
      <div className={classes} data-empty="true">
        {fallback}
      </div>
    );
  }

  if (renderImage) {
    return (
      <div className={classes}>
        {renderImage({
          src,
          alt,
          fill: true,
          sizes: SIZES[shape],
          priority,
          style: { objectFit: "cover" },
        })}
      </div>
    );
  }

  return (
    <div className={classes}>
      <img src={src} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" />
    </div>
  );
}
