import { useCallback, useEffect, useId, useRef, useState } from "react";
import { getControlLog, type ControlJob, type ControlPhase } from "../api";
import { controlJobHint, controlJobTitle } from "../lib/controlJob";
import { formatElapsed } from "../lib/format";
import { useFocusTrap } from "../lib/useFocusTrap";
import { usePoll } from "../lib/usePoll";
import { useTick } from "../lib/useTick";
import { Icon } from "./Icon";
import { strings } from "../strings";

interface ControlProgressProps {
  job: ControlJob;

  bankTitle?: string;
  onRetry: () => void | Promise<void>;
  onDismiss: () => void;
  onBackground: () => void;
}

const BLACKOUT_PHASE = "restart-facilitator";

const LOG_POLL_MS = 2000;

function parseStamp(stamp: string | undefined): number | null {
  if (!stamp) return null;
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? null : ms;
}

function phaseElapsed(phase: ControlPhase, now: number): string | null {
  const started = parseStamp(phase.startedAt);
  if (started === null) return null;
  const finished = parseStamp(phase.finishedAt);
  if (finished !== null) return formatElapsed(finished - started);
  if (phase.state === "running") return formatElapsed(now - started);
  return null;
}

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

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };
  const dialogRef = useRef<HTMLDivElement>(null);

  const onEscape = useCallback(
    () => (failed ? onDismiss() : onBackground()),
    [failed, onDismiss, onBackground],
  );
  useFocusTrap(dialogRef, onEscape);

  const now = useTick(!failed);

  const title = controlJobTitle(job, bankTitle);
  const running = job.phases.find((p) => p.state === "running");
  const reconnecting = running?.id === BLACKOUT_PHASE;

  const [logOpen, setLogOpen] = useState(false);
  const [logLines, setLogLines] = useState<string[] | null>(null);
  const logPaneRef = useRef<HTMLPreElement>(null);

  const logStickRef = useRef(true);

  usePoll(
    async () => {
      const log = await getControlLog();
      setLogLines(log.lines);
    },
    // A finished job's log is finished with it: read it once and stop.
    () => (failed ? null : LOG_POLL_MS),
    { enabled: logOpen && !reconnecting, restartKey: failed },
  );

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

        <details
          className="control-log"
          onToggle={(event) => setLogOpen(event.currentTarget.open)}
        >
          <summary>
            <Icon name="chevron-down" className="disclosure-chevron" />
            {strings.control.showLog}
          </summary>

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

            <p className="error-text" role="alert">
              {job.error}
            </p>
            <div className="control-actions">
              <button className="btn" onClick={onDismiss}>
                {strings.control.dismiss}
              </button>

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

              {controlJobHint(job)}
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
