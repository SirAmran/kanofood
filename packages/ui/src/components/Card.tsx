import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../cn";

/**
 * Card.
 *
 * Depth comes from lightness and a soft shadow rather than a border on every
 * card, which is the first rule in the design system README. `flat` exists for
 * the case where cards sit inside a card, where a second shadow would read as
 * noise rather than depth.
 */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly flat?: boolean;
  readonly interactive?: boolean;
}

export function Card({ flat = false, interactive = false, className, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn("kf-card", flat && "kf-card--flat", interactive && "kf-card--interactive", className)}
    />
  );
}

export function CardHeader({
  title,
  action,
  className,
}: {
  readonly title: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("kf-card__header", className)}>
      <h2 className="kf-card__title">{title}</h2>
      {action}
    </div>
  );
}

export function CardBody({
  flush = false,
  className,
  children,
}: {
  readonly flush?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={cn("kf-card__body", flush && "kf-card__body--flush", className)}>{children}</div>
  );
}

export function CardFooter({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  return <div className={cn("kf-card__footer", className)}>{children}</div>;
}

/**
 * A list of rows inside a card. Rendered as a `<ul>`, because it is a list, and
 * a screen reader announcing "list, 12 items" is worth the two lines.
 */
export function CardList({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  return <ul className={cn("kf-list", className)}>{children}</ul>;
}
