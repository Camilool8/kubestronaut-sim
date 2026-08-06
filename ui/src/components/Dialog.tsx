import { useId, useRef, type ReactNode } from "react";
import { useFocusTrap } from "../lib/useFocusTrap";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;

  wide?: boolean;

  sheet?: boolean;

  className?: string;
}

export function Dialog({
  title,
  onClose,
  children,
  wide = false,
  sheet = false,
  className = "",
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, onClose);

  return (
    <div className={`confirm-overlay${sheet ? " confirm-overlay-sheet" : ""}`}>
      <div
        ref={ref}
        className={[
          "confirm-dialog",
          wide ? "confirm-dialog-wide" : "",
          sheet ? "confirm-dialog-sheet" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >

        {sheet && <span className="sheet-grip" aria-hidden="true" />}
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
