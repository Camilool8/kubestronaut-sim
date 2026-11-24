import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { desktopKeymap } from "../lib/desktopKeymap";
import { singleKeyShortcuts, useSingleKeyShortcuts } from "../lib/singleKeyShortcuts";
import { strings } from "../strings";

interface KeyboardSettingsProps {
  onClose: () => void;
  onShowHelp?: () => void;
}

export function KeyboardSettings({ onClose, onShowHelp }: KeyboardSettingsProps) {
  const titleId = useId();
  const macId = useId();
  const reservedId = useId();
  const singleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useSyncExternalStore(desktopKeymap.subscribe, desktopKeymap.getVersion, desktopKeymap.getVersion);
  const singleKeys = useSingleKeyShortcuts();

  useEffect(() => {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, []);

  const showHelp = () => {
    const opener = openerRef.current;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    onShowHelp?.();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="keyboard-popover" role="group" aria-labelledby={titleId}>
      <h2 id={titleId}>{strings.keyboard.settingsTitle}</h2>

      <div className="keyboard-row">
        <input
          id={singleId}
          type="checkbox"
          checked={singleKeys}
          onChange={(e) => singleKeyShortcuts.setEnabled(e.target.checked)}
        />
        <label htmlFor={singleId}>{strings.focus.singleKeysToggle}</label>
      </div>
      <p className="clipboard-hint">{strings.focus.singleKeysHint}</p>

      {desktopKeymap.isMac && (
        <>
          <div className="keyboard-row">
            <input
              id={macId}
              type="checkbox"
              checked={desktopKeymap.enabled}
              onChange={(e) => desktopKeymap.setEnabled(e.target.checked)}
            />
            <label htmlFor={macId}>{strings.keyboard.macToggle}</label>
          </div>
          <p className="clipboard-hint">{strings.keyboard.macToggleHint}</p>

          <div className="keyboard-row">
            <input
              id={reservedId}
              type="checkbox"
              checked={desktopKeymap.reservedEnabled}
              onChange={(e) => desktopKeymap.setReservedEnabled(e.target.checked)}
              disabled={!desktopKeymap.enabled}
            />
            <label htmlFor={reservedId}>{strings.keyboard.reservedToggle}</label>
          </div>

          <p className="clipboard-hint">{strings.keyboard.reservedHint}</p>
        </>
      )}

      {onShowHelp && (
        <button className="btn" onClick={showHelp}>
          {strings.keyboard.helpOpen}
        </button>
      )}
    </div>
  );
}
