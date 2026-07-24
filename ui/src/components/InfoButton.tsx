import { useState } from "react";
import { InfoDrawer } from "./InfoDrawer";
import { strings } from "../strings";

// Self-contained "About" affordance: the button and the drawer it opens.
// Rendered in the exam topbar (with tour restart) and floating on the
// lobby/score screens.
export function InfoButton({
  floating = false,
  onRestartTour,
}: {
  floating?: boolean;
  onRestartTour?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className={`info-button${floating ? " info-button-floating" : ""}`}
        onClick={() => setOpen(true)}
        aria-label={strings.info.open}
      >
        ?
      </button>
      {open && (
        <InfoDrawer onClose={() => setOpen(false)} onRestartTour={onRestartTour} />
      )}
    </>
  );
}
