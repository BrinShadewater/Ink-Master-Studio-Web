import { RefObject, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const nextDialogFocusIndex = (
  currentIndex: number,
  count: number,
  backwards: boolean,
): number => {
  if (count <= 0) return -1;
  if (count === 1) return 0;
  if (backwards) return currentIndex <= 0 ? count - 1 : currentIndex - 1;
  return currentIndex >= count - 1 ? 0 : currentIndex + 1;
};

interface AccessibleDialogOptions {
  open: boolean;
  topmost?: boolean;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export const useAccessibleDialog = ({
  open,
  topmost = true,
  onClose,
  initialFocusRef,
}: AccessibleDialogOptions) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const focusedForOpenRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    focusedForOpenRef.current = false;
    return () => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
      focusedForOpenRef.current = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !topmost) return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const focusable = () => (
      Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)) as HTMLElement[]
    ).filter((element) =>
      !element.closest('[inert]')
      && !element.hidden
      && element.getClientRects().length > 0);
    const focusInitial = () => {
      if (focusedForOpenRef.current) return;
      const target = initialFocusRef?.current ?? focusable()[0] ?? dialog;
      target.focus();
      focusedForOpenRef.current = true;
    };
    const timer = focusedForOpenRef.current
      ? null
      : window.setTimeout(focusInitial, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      if (controls.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const currentIndex = controls.indexOf(document.activeElement as HTMLElement);
      const nextIndex = nextDialogFocusIndex(
        currentIndex,
        controls.length,
        event.shiftKey,
      );
      const leavingBounds = currentIndex === -1
        || (!event.shiftKey && currentIndex === controls.length - 1)
        || (event.shiftKey && currentIndex === 0);
      if (leavingBounds) {
        event.preventDefault();
        controls[nextIndex].focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [initialFocusRef, open, topmost]);

  return dialogRef;
};
