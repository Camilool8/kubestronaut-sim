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

const CloseContext = createContext<() => void>(() => {});

export function NavMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);

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

        <span className="nav-menu-bars" aria-hidden="true" data-open={open || undefined}>
          <span />
          <span />
          <span />
        </span>
      </button>
      {open && (
        <>

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

  icon: IconName;
  onSelect?: () => void;

  current?: boolean;

  detail?: string;

  danger?: boolean;

  keepOpen?: boolean;
}

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

export function NavMenuFact({ label, icon, detail }: { label: string; icon: IconName; detail?: string }) {
  return (
    <span className="nav-menu-item nav-menu-item-fact">
      <Icon name={icon} className="nav-menu-item-glyph" />
      {label}
      {detail && <span className="nav-menu-item-detail">{detail}</span>}
    </span>
  );
}

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
