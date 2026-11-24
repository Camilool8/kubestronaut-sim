import { useCallback, useEffect, useId, useRef, useState } from "react";
import { beginSession, getSession, type PreparingAttempt, type SessionSnapshot } from "../api";
import { ExamIntro, introSeen, markIntroSeen } from "../components/ExamIntro";
import { formatDuration } from "../lib/format";
import { strings } from "../strings";

interface ReadyProps {
  preparing: PreparingAttempt;
  examLabel: string;
  onSessionChange: (session: SessionSnapshot) => void;
}

const notified = new Set<string>();

function useReadyNotice(jobId: string, title: string, body: string) {
  useEffect(() => {
    if (!document.hidden || notified.has(jobId)) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    notified.add(jobId);
    try {
      const notice = new Notification(title, { body, tag: `ready-${jobId}` });
      notice.onclick = () => {
        window.focus();
        notice.close();
      };
    } catch {
      notified.delete(jobId);
    }
  }, [jobId, title, body]);
}

export function Ready({ preparing, examLabel, onSessionChange }: ReadyProps) {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [introOpen, setIntroOpen] = useState(() => !introSeen());
  const focusHeading = useRef(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const untimed = preparing.mode === "training";
  const duration = preparing.durationSeconds ?? 0;
  const modeLabel = preparing.mode ? strings.modes[preparing.mode].label : "";

  useReadyNotice(
    preparing.jobId,
    examLabel ? `${strings.titles.ready} · ${examLabel}` : strings.titles.ready,
    strings.ready.notifyBody(preparing.questionCount),
  );

  useEffect(() => {
    if (introOpen || !focusHeading.current) return;
    focusHeading.current = false;
    headingRef.current?.focus({ preventScroll: true });
  }, [introOpen]);

  const closeIntro = useCallback(() => {
    markIntroSeen();
    setIntroOpen(false);
  }, []);

  const begin = async () => {
    setStarting(true);
    setError(null);
    try {
      const result = await beginSession();
      if (result.ok) {
        onSessionChange(result.session);
        return;
      }
      setError(strings.ready.beginFailed(result.error));
      onSessionChange(await getSession());
    } catch (err) {
      setError(strings.ready.beginFailed(err instanceof Error ? err.message : String(err)));
    }
    setStarting(false);
  };

  return (
    <div className="boot-screen">
      <div className="boot-panel ready-panel" role="group" aria-labelledby={titleId}>
        <h1 id={titleId} ref={headingRef} tabIndex={-1}>
          {strings.ready.title(preparing.questionCount)}
        </h1>
        <p className="ready-lead">{strings.ready.lead}</p>

        <dl className="ready-facts" aria-label={strings.ready.factsLabel}>
          {examLabel && (
            <div>
              <dt>{strings.ready.factExam}</dt>
              <dd>{examLabel}</dd>
            </div>
          )}
          {modeLabel && (
            <div>
              <dt>{strings.ready.factMode}</dt>
              <dd>{modeLabel}</dd>
            </div>
          )}
          <div>
            <dt>{strings.ready.factClock}</dt>
            <dd>{untimed || duration <= 0 ? strings.mode.untimed : formatDuration(duration)}</dd>
          </div>
          <div>
            <dt>{strings.ready.factTasks}</dt>
            <dd>{preparing.questionCount}</dd>
          </div>
        </dl>

        <p className="control-hint">
          {untimed ? strings.ready.clockNoteUntimed : strings.ready.clockNote}
        </p>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <div className="ready-actions">
          <button type="button" className="btn" onClick={() => setIntroOpen(true)}>
            {strings.intro.open}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void begin()}
            disabled={starting}
          >
            {starting
              ? strings.ready.starting
              : untimed
                ? strings.ready.startUntimed
                : strings.ready.start}
          </button>
        </div>
      </div>

      {introOpen && (
        <ExamIntro
          onClose={closeIntro}
          durationSeconds={untimed || duration <= 0 ? undefined : duration}
        />
      )}
    </div>
  );
}
