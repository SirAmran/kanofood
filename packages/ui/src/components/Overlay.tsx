"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * Overlays.
 *
 * Built on the native `<dialog>` element rather than on a hand-rolled portal.
 * The browser already gets the hard parts right: the focus trap, the Escape key,
 * inertness of the page behind it, and returning focus to whatever opened it.
 * Reimplementing that is how a design system ends up with a dialog a keyboard
 * user cannot leave.
 *
 * `Modal` is the desktop shape and `BottomSheet` is the same content on a phone,
 * where the thumb is. Both are the same element; only the class differs, and the
 * stylesheet decides which one it is at the current width.
 */

export interface OverlayProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: ReactNode;
  readonly children?: ReactNode;
  /** Buttons for the foot of the sheet. */
  readonly actions?: ReactNode;
  /** Set when closing would discard work, so an accidental Escape does not. */
  readonly dismissable?: boolean;
  readonly className?: string;
}

function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // The dialog's own `close` fires on Escape and on a programmatic close.
    // Reporting both keeps the caller's state in step with the element's.
    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  return ref;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  actions,
  dismissable = true,
  className,
}: OverlayProps) {
  const ref = useDialog(open, onClose);

  return (
    <dialog
      ref={ref}
      className={cn("kf-modal", className)}
      onCancel={(event) => {
        if (!dismissable) event.preventDefault();
      }}
      aria-label={typeof title === "string" ? title : undefined}
    >
      <div className="kf-modal__panel">
        <h2 className="kf-modal__title">{title}</h2>
        {children}
        {actions ? <div className="kf-modal__actions">{actions}</div> : null}
      </div>
    </dialog>
  );
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  actions,
  dismissable = true,
  className,
}: OverlayProps) {
  const ref = useDialog(open, onClose);

  return (
    <dialog
      ref={ref}
      className={cn("kf-sheet", className)}
      onCancel={(event) => {
        if (!dismissable) event.preventDefault();
      }}
      aria-label={typeof title === "string" ? title : undefined}
    >
      <div className="kf-sheet__panel">
        <span className="kf-sheet__grabber" aria-hidden="true" />
        <h2 className="kf-modal__title">{title}</h2>
        {children}
        {actions ? <div className="kf-modal__actions">{actions}</div> : null}
      </div>
    </dialog>
  );
}
