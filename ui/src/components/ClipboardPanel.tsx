import { useCallback, useId, useRef, useState, useSyncExternalStore } from "react";
import { desktopClipboard } from "../lib/desktopClipboard";
import { toastStore } from "./toastStore";
import { strings } from "../strings";
import { Icon } from "./Icon";

interface ClipboardPanelProps {
  onClose: () => void;
}

/**
 * Two-way clipboard between the browser and the exam desktop.
 *
 * ⌘V/Ctrl+V over the canvas already does this in one keystroke where the
 * browser permits it — but navigator.clipboard.readText does not exist
 * for web content in Firefox and needs a granted permission in Chrome,
 * so for a large share of candidates the keystroke cannot work. This is
 * the path that always works, in every browser, with no prompt: a
 * textarea you paste into normally, and a readout of what the desktop
 * last copied with a button to take it.
 *
 * It is always available rather than appearing only after a failure —
 * a candidate needs to know it exists before they hit the failure, in
 * the middle of a timed exam.
 *
 * Rendered absolutely inside the question panel, following QuestionJump:
 * anything that changes .desktop-pane's geometry fires noVNC's
 * ResizeObserver and costs a server-side framebuffer resize.
 */
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
      // A click is a real user gesture, which is exactly what the
      // WebSocket-driven path could never provide.
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
