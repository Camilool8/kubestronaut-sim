import { useCallback, useId, useRef, useState, useSyncExternalStore } from "react";
import { desktopClipboard } from "../lib/desktopClipboard";
import { toastStore } from "./toastStore";
import { strings } from "../strings";
import { Icon } from "./Icon";

interface ClipboardPanelProps {
  onClose: () => void;
}

export function ClipboardPanel({ onClose }: ClipboardPanelProps) {
  const titleId = useId();
  const outId = useId();
  const inId = useId();
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const remote = useSyncExternalStore(
    desktopClipboard.subscribe,
    desktopClipboard.getRemote,
    desktopClipboard.getRemote,
  );

  const send = useCallback(() => {
    if (!draft) return;
    const ok = desktopClipboard.sendToDesktop(draft);
    toastStore.push({
      kind: ok ? "info" : "warning",
      message: ok ? strings.clipboard.sent : strings.clipboard.sendFailed,
      dedupeKey: "clipboard-send",
    });
    if (ok) setDraft("");
  }, [draft]);

  const copyOut = useCallback(async () => {
    if (!remote) return;
    try {
      await navigator.clipboard.writeText(remote);
      toastStore.push({
        kind: "info",
        message: strings.clipboard.copiedToHost,
        dedupeKey: "clipboard-out",
      });
    } catch {
      toastStore.push({
        kind: "warning",
        message: strings.questionPanel.copyFailed,
        dedupeKey: "clipboard-out",
      });
    }
  }, [remote]);

  return (
    <div className="clipboard-panel" role="group" aria-labelledby={titleId}>
      <div className="clipboard-head">
        <h2 id={titleId}>{strings.clipboard.title}</h2>
        <button className="info-button" onClick={onClose} aria-label={strings.info.close}>
          <Icon name="cross" />
        </button>
      </div>

      <label className="clipboard-label" htmlFor={inId}>
        {strings.clipboard.toDesktopLabel}
      </label>
      <p className="clipboard-hint">{strings.clipboard.toDesktopHint}</p>
      <textarea
        id={inId}
        ref={textareaRef}
        className="clipboard-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        spellCheck={false}
      />
      <div className="clipboard-actions">
        <button className="btn btn-primary" onClick={send} disabled={!draft}>
          {strings.clipboard.send}
        </button>
      </div>

      <label className="clipboard-label" htmlFor={outId}>
        {strings.clipboard.fromDesktopLabel}
      </label>
      {remote ? (
        <>
          <pre id={outId} className="clipboard-output">
            {remote}
          </pre>
          <div className="clipboard-actions">
            <button className="btn" onClick={() => void copyOut()}>
              {strings.clipboard.copyToHost}
            </button>
          </div>
        </>
      ) : (
        <p id={outId} className="clipboard-hint">
          {strings.clipboard.fromDesktopEmpty}
        </p>
      )}
    </div>
  );
}
