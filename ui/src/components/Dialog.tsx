import { useId, useRef, type ReactNode } from "react";
import { useFocusTrap } from "../lib/useFocusTrap";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Widens the dialog for content that is more than a paragraph and two
   *  buttons (the exam intro's schematic and legend). */
  wide?: boolean;
  /**
   * Anchor to the bottom edge and rise from it, rather than sitting in
   * the middle of the screen.
   *
   * The same dialog in every other respect — scrim, focus trap, Escape,
   * `aria-modal` — because it IS the same thing, and a second modal
   * primitive would be two implementations of focus management to keep
   * correct. What differs is where the thumb is: a sheet's controls
   * arrive under it, and a centred dialog's arrive in the middle of the
   * screen where reaching them means shifting grip.
   *
   * Set by the caller rather than by a media query in here, because the
   * choice is not always about width. The navigator is a sheet on a
   * phone and a full-panel overlay on a desktop; the submit confirmation
   * is a centred dialog everywhere, because a destructive action should
   * not arrive exactly where the thumb already is.
   */
  sheet?: boolean;
  /** Extra class on the panel, for a caller that styles its own body. */
  className?: string;
}

// Accessible modal dialog: focus moves inside on open, Tab cycles within,
// Escape closes, and focus returns to the opener on unmount. Replaces the
// bare-div overlays that leaked keyboard focus into the page (and the
// desktop viewport) behind them.
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
        {/* The grab handle. Decorative — this sheet is dismissed by the
            scrim, by Escape and by its own controls, and drawing a
            control that only looks draggable would be a false
            affordance. It is here because a panel that rises from the
            bottom edge with no handle reads as a layout accident. */}
        {sheet && <span className="sheet-grip" aria-hidden="true" />}
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
