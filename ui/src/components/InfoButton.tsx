import { useState } from "react";
import { InfoDrawer } from "./InfoDrawer";
import { Icon } from "./Icon";
import { strings } from "../strings";

// Self-contained "About" affordance: the button and the drawer it opens.
// Rendered in the exam topbar and in the app header everywhere else.
// `onShowIntro` is passed by screens that can render the intro card.
export function InfoButton({ onShowIntro }: { onShowIntro?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="info-button"
        onClick={() => setOpen(true)}
        aria-label={strings.info.open}
      >
        <Icon name="help" />
      </button>
      {open && (
        <InfoDrawer onClose={() => setOpen(false)} onShowIntro={onShowIntro} />
      )}
    </>
  );
}
