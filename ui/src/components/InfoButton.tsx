import { useState } from "react";
import { InfoDrawer } from "./InfoDrawer";
import { Icon } from "./Icon";
import { strings } from "../strings";

export function InfoButton({
  onShowIntro,
  labelled = false,
}: {
  onShowIntro?: () => void;

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
