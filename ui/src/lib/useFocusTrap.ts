import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Shared modal focus behavior: move focus inside on mount, keep Tab
// cycling within the container, close on Escape, and restore focus to
// the opener on unmount. Used by Dialog (and so by every dialog built on
// it, including the exam intro) and by InfoDrawer.
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const opener = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
    // preventScroll, because focusing the first control also scrolls it
    // into view — and in a dialog tall enough to scroll internally, the
    // first control is at the *bottom*. Opening the exam intro card in a
    // short window jumped straight past its title and diagram to the
    // "Got it" button. Focus still lands where it should; only the
    // scroll-into-view is suppressed, so the dialog opens at its top.
    (focusables()[0] ?? container).focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [ref, onClose]);
}
