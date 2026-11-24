import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { holdModal } from "./modalLayer";

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

const traps: object[] = [];

function reachable(el: HTMLElement, container: HTMLElement): boolean {
  for (let node: HTMLElement | null = el; node && node !== container; node = node.parentElement) {
    if (node.hidden || node.hasAttribute("inert")) return false;
    const parent: HTMLElement | null = node.parentElement;
    if (
      parent instanceof HTMLDetailsElement &&
      !parent.open &&
      parent.querySelector(":scope > summary") !== node
    ) {
      return false;
    }
  }
  if (typeof el.checkVisibility === "function") return el.checkVisibility();
  return true;
}

export function focusablesIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) =>
    reachable(el, container),
  );
}

interface FocusTrapOptions {
  modal?: boolean;
}

export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled = true,
  { modal = false }: FocusTrapOptions = {},
): void {
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!enabled) return;
    const container = ref.current;
    if (!container) return;
    const opener = document.activeElement as HTMLElement | null;
    const release = modal ? holdModal(container) : null;
    const token = {};
    traps.push(token);

    const focusContainer = () => {
      if (!container.hasAttribute("tabindex")) container.setAttribute("tabindex", "-1");
      container.focus({ preventScroll: true });
    };

    const initial = focusablesIn(container)[0];
    initial?.focus({ preventScroll: true });
    if (!initial || document.activeElement !== initial) focusContainer();

    const onKeyDown = (e: KeyboardEvent) => {
      if (traps[traps.length - 1] !== token) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusablesIn(container);
      if (items.length === 0) {
        e.preventDefault();
        focusContainer();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!active || !container.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === container)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const at = traps.lastIndexOf(token);
      if (at !== -1) traps.splice(at, 1);
      release?.();
      const active = document.activeElement;
      const lost = !active || active === document.body || container.contains(active);
      if (lost && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [ref, enabled, modal]);
}
