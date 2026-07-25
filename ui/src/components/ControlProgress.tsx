import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ControlJob, ControlPhase } from "../api";
import { formatElapsed } from "../lib/format";
import { useFocusTrap } from "../lib/useFocusTrap";
import { strings } from "../strings";

interface ControlProgressProps {
  job: ControlJob;
  /** Resolved catalog title for job.bank — the slug is never shown. */
  bankTitle?: string;
  onRetry: () => void;
  onDismiss: () => void;
  onBackground: () => void;
}

// The phase that takes the facilitator — and therefore the browser's
// only server — down. While it runs, polls fail and the checklist would
// otherwise appear frozen, so the dialog says so out loud instead.
const BLACKOUT_PHASE = "restart-facilitator";

function parseStamp(stamp: string | undefined): number | null {
  if (!stamp) return null;
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? null : ms;
}

// A settled phase reports the span it actually took; a running one
// reports how long it has been going as of `now`. Anything unstarted
// reports nothing rather than a misleading zero.
function phaseElapsed(phase: ControlPhase, now: number): string | null {
  const started = parseStamp(phase.startedAt);
  if (started === null) return null;
  const finished = parseStamp(phase.finishedAt);
  if (finished !== null) return formatElapsed(finished - started);
  if (phase.state === "running") return formatElapsed(now - started);
  return null;
}

// Full-screen overlay tracking a conductor job (reset / bank switch).
// Rendered by App whenever a control job is in flight — or has failed
// and not been dismissed — so it survives every screen transition the
// job itself causes.
//
// A rebuild runs for minutes, so the dialog's job is to never look
// stuck: the running phase carries a live duration and the latest line
// its command printed, settled phases keep their final durations, and
// the whole thing can be pushed to the background rather than trapping
// the user behind a modal they cannot dismiss.
export function ControlProgress({
  job,
  bankTitle,
  onRetry,
  onDismiss,
  onBackground,
}: ControlProgressProps) {
  const failed = Boolean(job.error);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // The dialog declared aria-modal="true" while trapping nothing, so
  // focus walked straight out to the screen behind an overlay that is
  // supposed to be blocking — the markup was lying to assistive tech.
  //
  // Escape does not close: this is an in-flight destructive rebuild with
  // no cancel operation behind it. It backgrounds instead, which keeps
  // the gesture meaningful and keeps the dialog from being a keyboard
  // dead end for the several minutes a rebuild takes. Once the job has
  // failed, Escape dismisses as usual.
  const onEscape = useCallback(
    () => (failed ? onDismiss() : onBackground()),
    [failed, onDismiss, onBackground],
  );
  useFocusTrap(dialogRef, onEscape);

  // 1Hz tick purely to re-render; every displayed duration is recomputed
  // from the server's stamps, so it resyncs on its own and never drifts.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (failed) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [failed]);

  const target = bankTitle || job.bank;
  const title =
    job.op === "switch" ? strings.control.switchTitle(target) : strings.control.resetTitle;
  const running = job.phases.find((p) => p.state === "running");
  const reconnecting = running?.id === BLACKOUT_PHASE;
  const jobStarted = parseStamp(job.startedAt);
  const totalElapsed = jobStarted === null ? null : formatElapsed(now - jobStarted);
  const doneCount = job.phases.filter((p) => p.state === "done").length;

  return (
    <div className="control-overlay">
      <div
        ref={dialogRef}
        className="control-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>{failed ? strings.control.failedTitle(job.op) : title}</h2>

        {/* The single announcer: one polite line naming the current step.
            It changes only when the phase changes, so a screen reader
            hears six updates over a four-minute rebuild rather than one
            per second. The ticking durations below are deliberately
            outside it. */}
        <p className="control-status" role="status" aria-live="polite" aria-atomic="true">
          {failed
            ? ""
            : reconnecting
              ? strings.control.reconnecting
              : strings.control.stepOf(doneCount + 1, job.phases.length, running?.label ?? "")}
        </p>

        <ul className="control-phases">
          {job.phases.map((p) => {
            const elapsed = phaseElapsed(p, now);
            return (
              <li key={p.id} className={`phase-${p.state}`}>
                {p.state === "running" ? (
                  <span className="phase-mark phase-mark-spinner" aria-hidden="true" />
                ) : (
                  <span className="phase-mark" aria-hidden="true">
                    {p.state === "done" ? "✓" : p.state === "failed" ? "✗" : "·"}
                  </span>
                )}
                <span className="phase-label">{p.label}</span>
                {elapsed && (
                  <span className="phase-elapsed" aria-hidden="true">
                    {elapsed}
                  </span>
                )}
                {p.state === "running" && p.detail && (
                  <span className="phase-detail" aria-hidden="true">
                    {p.detail}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {failed ? (
          <>
            {/* Present-and-empty above would announce unreliably; this
                region only ever renders with its content. */}
            <p className="error-text" role="alert">
              {job.error}
            </p>
            <div className="control-actions">
              <button className="btn" onClick={onDismiss}>
                {strings.control.dismiss}
              </button>
              <button className="btn btn-primary" onClick={onRetry}>
                {strings.control.retry}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="control-hint">
              {strings.control.hint}
              {totalElapsed && (
                <span className="control-elapsed" aria-hidden="true">
                  {strings.control.elapsed(totalElapsed)}
                </span>
              )}
            </p>
            <div className="control-actions">
              <button className="btn" onClick={onBackground}>
                {strings.control.background}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
