import { useCallback, useEffect, useId, useRef, useState } from "react";
import { getControlLog, type ControlJob, type ControlPhase } from "../api";
import { formatElapsed } from "../lib/format";
import { useFocusTrap } from "../lib/useFocusTrap";
import { Icon } from "./Icon";
import { strings } from "../strings";

interface ControlProgressProps {
  job: ControlJob;
  /** Resolved catalog title for job.bank — the slug is never shown. */
  bankTitle?: string;
  onRetry: () => void | Promise<void>;
  onDismiss: () => void;
  onBackground: () => void;
}

// The phase that takes the facilitator — and therefore the browser's
// only server — down. While it runs, polls fail and the checklist would
// otherwise appear frozen, so the dialog says so out loud instead.
const BLACKOUT_PHASE = "restart-facilitator";

// The log pane's poll, while it is open. The conductor caps the log at
// 200 short lines, so this is a small read, and it stops the moment the
// pane closes or the job settles.
const LOG_POLL_MS = 2000;

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
  const [retrying, setRetrying] = useState(false);
  const titleId = useId();

  // Awaits the outcome rather than latching a local flag. A retry that is
  // refused leaves this component mounted on the same job id, so a flag
  // cleared only by a new job would disable the one button that could get
  // the user out — the same trap the fetch timeout in api.ts exists to
  // prevent. Dismiss is never disabled for the same reason: it is the
  // escape hatch.
  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };
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
  // A seed prepares the cluster for an attempt that has already been
  // drawn; it destroys nothing and the clock has not started. Titled as
  // itself rather than falling through to the reset's wording, which
  // would tell a candidate waiting to begin that their environment is
  // being wiped.
  const title =
    job.op === "switch"
      ? strings.control.switchTitle(target)
      : job.op === "seed"
        ? strings.control.seedTitle
        : strings.control.resetTitle;
  const running = job.phases.find((p) => p.state === "running");
  const reconnecting = running?.id === BLACKOUT_PHASE;

  // The build log, behind a closed disclosure. The one-line phase detail
  // above overwrites itself; this is the retained output for whoever
  // looked away for a minute of a four-minute rebuild. null = never
  // fetched, so the empty state can tell "nothing printed yet" from
  // "not open yet".
  const [logOpen, setLogOpen] = useState(false);
  const [logLines, setLogLines] = useState<string[] | null>(null);
  const logPaneRef = useRef<HTMLPreElement>(null);
  // Follow the newest line unless the user has scrolled up to read;
  // snapping them back down mid-read would be the pane fighting them.
  const logStickRef = useRef(true);

  useEffect(() => {
    // During the blackout phase the facilitator is down and every fetch
    // would fail; the pane keeps its last lines and resumes after.
    if (!logOpen || reconnecting) return;
    let cancelled = false;
    const load = async () => {
      try {
        const log = await getControlLog();
        if (!cancelled) setLogLines(log.lines);
      } catch {
        // Keep the last lines; the next tick retries.
      }
    };
    void load();
    // A settled job's log is static: one read is the whole story.
    if (failed) {
      return () => {
        cancelled = true;
      };
    }
    const id = window.setInterval(() => void load(), LOG_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [logOpen, failed, reconnecting]);

  useEffect(() => {
    const pane = logPaneRef.current;
    if (pane && logStickRef.current) pane.scrollTop = pane.scrollHeight;
  }, [logLines]);

  const onLogScroll = () => {
    const pane = logPaneRef.current;
    if (!pane) return;
    logStickRef.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 8;
  };
  const jobStarted = parseStamp(job.startedAt);
  const totalElapsed = jobStarted === null ? null : formatElapsed(now - jobStarted);
  const doneCount = job.phases.filter((p) => p.state === "done").length;
  // An mcq reset/switch never advertises this phase — see resetPhases/
  // switchPhases in control.go. Its absence is exactly the "no cluster
  // rebuild" signal the hint needs, with no extra prop to thread through.
  const hasClusterRebuild = job.phases.some((p) => p.id === "recreate-cluster");

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
                    {p.state === "done" ? (
                      <Icon name="check" />
                    ) : p.state === "failed" ? (
                      <Icon name="cross" />
                    ) : (
                      "·"
                    )}
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

        {/* Closed by default: the checklist is the summary, this is the
            appendix. Rendered in both states — a failed job's log is
            exactly the one worth reading. */}
        <details
          className="control-log"
          onToggle={(event) => setLogOpen(event.currentTarget.open)}
        >
          <summary>
            <Icon name="chevron-down" className="disclosure-chevron" />
            {strings.control.showLog}
          </summary>
          {/* Focusable because it scrolls: a keyboard user needs to reach
              it to read past the visible tail. */}
          <pre
            className="control-log-pane"
            ref={logPaneRef}
            onScroll={onLogScroll}
            tabIndex={0}
            aria-label={strings.control.logLabel}
          >
            {logLines === null || logLines.length === 0
              ? reconnecting
                ? strings.control.logUnavailable
                : strings.control.logEmpty
              : logLines.join("\n")}
          </pre>
        </details>

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
              {/* A failed job freezes its own clock, so without this the
                  dialog was entirely static from the click until the new
                  job's first poll — the one moment the user most needs to
                  know the button did something.

                  Not offered for a seed. Retry here means "run this job
                  again", and every other job on this screen is a cluster
                  rebuild, so that is what the handler does — for a failed
                  seed it would tear down the environment the candidate
                  still has, to recover from an attempt that never
                  started. Dismissing lands them back on the mode screen,
                  where pressing Start again is the retry. */}
              {job.op !== "seed" && (
                <button className="btn btn-primary" onClick={handleRetry} disabled={retrying}>
                  {retrying ? strings.control.starting : strings.control.retry}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="control-hint">
              {/* A seed has neither shape: no cluster is rebuilt, but it
                  runs one setup script per drawn question against a live
                  cluster, so "usually a few seconds" would be a promise it
                  cannot keep on a sixteen-task draw. */}
              {job.op === "seed"
                ? strings.control.hintSeed
                : hasClusterRebuild
                  ? strings.control.hint
                  : strings.control.hintFast}
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
