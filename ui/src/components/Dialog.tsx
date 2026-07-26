import { useId, useRef, type ReactNode } from "react";
import { useFocusTrap } from "../lib/useFocusTrap";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Widens the dialog for content that is more than a paragraph and two
   *  buttons (the exam intro's schematic and legend). */
  wide?: boolean;
}

// Accessible modal dialog: focus moves inside on open, Tab cycles within,
// Escape closes, and focus returns to the opener on unmount. Replaces the
// bare-div overlays that leaked keyboard focus into the page (and the
// desktop viewport) behind them.
export function Dialog({ title, onClose, children, wide = false }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, onClose);

  return (
    <div className="confirm-overlay">
      <div
        ref={ref}
        className={`confirm-dialog${wide ? " confirm-dialog-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
