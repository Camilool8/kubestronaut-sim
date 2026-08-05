import { useState } from "react";
import { InfoDrawer } from "./InfoDrawer";
import { Icon } from "./Icon";
import { strings } from "../strings";

// Self-contained "About" affordance: the button and the drawer it opens.
// Rendered in the exam topbar and in the app header everywhere else.
// `onShowIntro` is passed by screens that can render the intro card.
export function InfoButton({
  onShowIntro,
  labelled = false,
}: {
  onShowIntro?: () => void;
  /**
   * Draw the label as well as the glyph.
   *
   * For the one place this appears in a list rather than in a bar: the
   * exam's overflow sheet on a phone. A 28px circle with a "?" in it is
   * legible next to a clock because a bar is a row of glyphs and reads
   * as one; the same circle alone in a stack of full-width rows reads as
   * a mistake, and its accessible name — which is correct either way —
   * is not available to the person looking at it.
   */
  labelled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className={`info-button${labelled ? " info-button-labelled" : ""}`}
        onClick={() => setOpen(true)}
        aria-label={labelled ? undefined : strings.info.open}
      >
        <Icon name="help" />
        {labelled && strings.info.open}
      </button>
      {open && (
        <InfoDrawer onClose={() => setOpen(false)} onShowIntro={onShowIntro} />
      )}
    </>
  );
}
