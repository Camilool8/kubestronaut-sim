import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "./Icon";
import { useFocusTrap } from "../lib/useFocusTrap";
import { MCQ_COMPACT_QUERY, useMediaQuery } from "../lib/useMediaQuery";

/**
 * The navbar's menu, and the single home for every command in it.
 *
 * The rule this exists to enforce: **the menu is always here, in the same
 * corner, holding the same sections in the same order.** What changes
 * between screens is only whether a section has anything in it — an
 * account section needs an account — never where a section sits or
 * whether the menu itself appears. The header this replaced rendered the
 * trigger only when `compact && (nav?.length || session)`, so it vanished
 * outright on the score screen and its contents rearranged by route,
 * which is the behaviour that made it feel unpredictable.
 *
 * On a wide viewport the navbar PROMOTES the navigation section into the
 * bar and this menu keeps the rest. Promotion is the only thing width
 * changes, and it is one rule rather than a per-screen arrangement.
 *
 * `role="group"`, not `role="menu"`. The ARIA menu pattern comes with a
 * keyboard contract — arrows move between items, Tab leaves — that this
 * does not implement and does not want: the contents are ordinary links
 * and buttons, and Tab through them is what everyone already has.
 */

/** Lets a row close the menu without every caller threading a prop. */
const CloseContext = createContext<() => void>(() => {});

export function NavMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // Stable across renders: useFocusTrap holds it in a dependency array,
  // and a fresh closure each render would re-run the effect — tearing
  // down and re-adding the key handler, and re-stealing focus, on every
  // parent render while the menu is open.
  const close = useCallback(() => setOpen(false), []);
  // A sheet from the bottom edge on a phone, a popover under the trigger
  // on a laptop. Same panel, same contents, same order — only where it
  // arrives from differs, because on a phone the trigger is in the one
  // corner a thumb cannot reach and the panel should not be.
  const asSheet = useMediaQuery(MCQ_COMPACT_QUERY);

  return (
    <div className="nav-menu">
      <button
        type="button"
        className="nav-menu-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Three bars that become a cross, drawn as three spans rather
            than swapped for a different glyph. Swapping icons is a
            change of subject; moving the same three lines says the menu
            you opened is the thing now closing. Purely decorative — the
            button's name is its aria-label and does not move. */}
        <span className="nav-menu-bars" aria-hidden="true" data-open={open || undefined}>
          <span />
          <span />
          <span />
        </span>
      </button>
      {open && (
        <>
          {/* Catches the click that dismisses. Not focusable and not in
              the a11y tree: Escape is the keyboard way out, and this is
              only for a pointer. */}
          <div className="nav-menu-scrim" aria-hidden="true" onClick={close} />
          <div
            ref={panelRef}
            id={panelId}
            role="group"
            aria-label={label}
            className={`nav-menu-panel${asSheet ? " nav-menu-panel-sheet" : ""}`}
          >
            <FocusTrap containerRef={panelRef} onClose={close} />
            {asSheet && <span className="sheet-grip" aria-hidden="true" />}
            <CloseContext.Provider value={close}>{children}</CloseContext.Provider>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A titled group of rows.
 *
 * The title is optional and the divider is not: sections are what make
 * the menu's order readable as an order rather than a list, and a group
 * with no visible boundary is just more rows.
 */
export function NavMenuSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="nav-menu-section">
      {label && <span className="nav-menu-section-label">{label}</span>}
      {children}
    </div>
  );
}

interface NavMenuItemProps {
  label: string;
  /** Leading glyph. Every row has one, so the labels align. */
  icon: IconName;
  onSelect?: () => void;
  /** Renders as the current location rather than something to press. */
  current?: boolean;
  /** Trailing text: the theme's current value, a session's login. */
  detail?: string;
  /** Reads as destructive — the one row that ends something. */
  danger?: boolean;
  /**
   * Do not close the menu on activation.
   *
   * For the one row whose whole purpose is to be pressed more than once:
   * the theme cycles System → Light → Dark, and a menu that shut after
   * the first press would make choosing the third a three-tap job.
   */
  keepOpen?: boolean;
}

/**
 * One row. Every item in this menu is one of these, and that is the
 * point: a fixed height, a leading glyph, a label, and an optional
 * trailing value, so a nav destination, a theme control and a sign-out
 * read as members of one list rather than as three borrowed widgets.
 */
export function NavMenuItem({
  label,
  icon,
  onSelect,
  current,
  detail,
  danger,
  keepOpen,
}: NavMenuItemProps) {
  const close = useContext(CloseContext);

  if (current) {
    // Not a disabled button: a disabled control says "this could work and
    // does not". Where you already are is not a control at all.
    return (
      <span className="nav-menu-item nav-menu-item-on" aria-current="page">
        <Icon name={icon} className="nav-menu-item-glyph" />
        {label}
        {detail && <span className="nav-menu-item-detail">{detail}</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`nav-menu-item${danger ? " nav-menu-item-danger" : ""}`}
      onClick={() => {
        onSelect?.();
        if (!keepOpen) close();
      }}
    >
      <Icon name={icon} className="nav-menu-item-glyph" />
      {label}
      {detail && <span className="nav-menu-item-detail">{detail}</span>}
    </button>
  );
}

/** A row that states a fact rather than offering an action. */
export function NavMenuFact({ label, icon, detail }: { label: string; icon: IconName; detail?: string }) {
  return (
    <span className="nav-menu-item nav-menu-item-fact">
      <Icon name={icon} className="nav-menu-item-glyph" />
      {label}
      {detail && <span className="nav-menu-item-detail">{detail}</span>}
    </span>
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
