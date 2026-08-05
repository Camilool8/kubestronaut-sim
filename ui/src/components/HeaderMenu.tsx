import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { useFocusTrap } from "../lib/useFocusTrap";

/**
 * The narrow-viewport home for everything in the header that is not
 * time-critical: the nav links and the session controls.
 *
 * A popover rather than a full-screen sheet because of what is behind it.
 * The bar keeps the lease countdown, and a takeover would hide the one
 * number a hosted candidate cannot be left to guess while they are
 * reading a menu.
 *
 * `role="group"` on the panel, not `role="menu"`. The ARIA menu pattern
 * comes with a keyboard contract — arrow keys move between items, Tab
 * leaves — that this does not implement and does not want: the contents
 * are ordinary links and buttons, and Tab through them is the behaviour
 * everyone already has.
 */
export function HeaderMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // Stable across renders: useFocusTrap holds it in a dependency array,
  // and a fresh closure each render would re-run the effect — tearing
  // down and re-adding the key handler, and re-stealing focus, on every
  // parent render while the menu is open.
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="header-menu">
      <button
        type="button"
        className="header-menu-button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="menu" />
      </button>
      {open && (
        <>
          {/* Catches the click that dismisses. Not focusable and not in
              the a11y tree: Escape is the keyboard way out, and this is
              only for a pointer. */}
          <div className="header-menu-scrim" aria-hidden="true" onClick={close} />
          <div
            ref={panelRef}
            id={panelId}
            role="group"
            aria-label={label}
            className="header-menu-panel"
            // Any activation inside closes. The contents are links and
            // one-shot actions, so there is nothing here a candidate
            // presses twice — and a menu still open over the screen its
            // own link just changed is the failure this avoids.
            onClick={close}
          >
            <FocusTrap containerRef={panelRef} onClose={close} />
            {children}
          </div>
        </>
      )}
    </div>
  );
}

// useFocusTrap must run against a mounted container, and the panel only
// exists while open. A child component keeps the hook unconditional — a
// hook called inside `{open && …}` in the parent would be a conditional
// hook — while still mounting and unmounting with the panel.
function FocusTrap({
  containerRef,
  onClose,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  useFocusTrap(containerRef, onClose);
  return null;
}
