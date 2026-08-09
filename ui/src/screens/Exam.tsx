import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  endSession,
  getExam,
  practiceGrade,
  putFocus,
  type ExamQuestionInfo,
  type Results,
  type SessionSnapshot,
} from "../api";
import { useAsync } from "../lib/useAsync";
import { TimerBar } from "../components/TimerBar";
import { QuestionPanel } from "../components/QuestionPanel";
import { Dialog } from "../components/Dialog";
import { NavMenuItem } from "../components/NavMenu";
import { KeyboardSettings } from "../components/KeyboardSettings";
import { ShortcutHelp } from "../components/ShortcutHelp";
import { ClipboardPanel } from "../components/ClipboardPanel";
import { CheckList } from "../components/CheckList";
import { Icon } from "../components/Icon";
import { desktopKeymap } from "../lib/desktopKeymap";
import { clipboardSync } from "../lib/clipboardSync";
import { ExamIntro, introSeen, markIntroSeen } from "../components/ExamIntro";
import { PanelResizer } from "../components/PanelResizer";
import { PendingBar } from "../components/Pending";
import { toastStore } from "../components/toastStore";
import { marksStore } from "../components/marksStore";
import { formatClock, formatClockSpoken, formatElapsed } from "../lib/format";
import { isTypingTarget } from "../lib/typing";
import { strings } from "../strings";

const DesktopViewport = lazy(() =>
  import("../components/DesktopViewport").then((m) => ({ default: m.DesktopViewport })),
);

// QuestionPanel is memoized, and a session poll re-renders Exam every 10
// seconds with a fresh `fetchedAt`. One shared empty array keeps the
// questions prop referentially stable while the exam is still loading, so
// the poll cannot invalidate the memo through it.
const NO_QUESTIONS: ExamQuestionInfo[] = [];

interface ExamProps {
  session: SessionSnapshot;
  fetchedAt: number;
  onSessionChange: (session: SessionSnapshot) => void;
}

export function ExamGateControls({ session, fetchedAt, onSessionChange }: ExamProps) {
  const [now, setNow] = useState(() => Date.now());
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = Math.max(
    0,
    session.remainingSeconds - Math.floor((now - fetchedAt) / 1000),
  );

  const untimed = session.untimed;
  const startedMs = session.startedAt ? Date.parse(session.startedAt) : NaN;
  const elapsed = Number.isNaN(startedMs) ? 0 : Math.max(0, now - startedMs);

  const end = async () => {
    setEnding(true);
    setEndError(null);
    try {
      const result = await endSession();
      if (result.ok) {
        onSessionChange(result.session);
      } else {
        setEndError(strings.exam.endFailed(result.error));
      }
    } catch (err) {
      setEndError(strings.exam.endFailed(String(err)));
    } finally {
      setEnding(false);
    }
  };

  return (
    <div className="gate-session">
      <p className="gate-session-timer">
        <span className="timer" role="timer">
          {untimed ? (
            <>
              <span aria-hidden="true">{formatElapsed(elapsed)}</span>
              <span className="sr-only">{strings.exam.timeElapsed(formatElapsed(elapsed))}</span>
            </>
          ) : (
            <>
              <span aria-hidden="true">{formatClock(remaining)}</span>
              <span className="sr-only">
                {strings.exam.timeRemaining(formatClockSpoken(remaining))}
              </span>
            </>
          )}
        </span>
      </p>
      <p>{untimed ? strings.mobile.sessionRunningUntimed : strings.mobile.sessionRunning}</p>
      {endError && (
        <p className="error-text" role="alert">
          {endError}
        </p>
      )}
      <button className="btn btn-danger" onClick={end} disabled={ending}>
        {ending ? strings.exam.ending : strings.exam.endAttempt(session.mode)}
      </button>
    </div>
  );
}

export function Exam({ session, fetchedAt, onSessionChange }: ExamProps) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [clipboardOpen, setClipboardOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [practice, setPractice] = useState<Results | null>(null);

  const scoreNow = async () => {
    setScoring(true);
    try {
      const res = await practiceGrade();
      if (res.ok) {
        setPractice(res.results);
      } else {
        toastStore.push({
          kind: "warning",
          message: strings.practice.failed(res.error),
          dedupeKey: "practice-grade",
        });
      }
    } catch (err) {
      toastStore.push({
        kind: "warning",
        message: strings.practice.failed(String(err)),
        dedupeKey: "practice-grade",
      });
    } finally {
      setScoring(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "?") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(".desktop-pane")) return;
      if (isTypingTarget(target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      setHelpOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    clipboardSync.start();
    return () => clipboardSync.stop();
  }, []);

  const [introOpen, setIntroOpen] = useState(() => {
    if (introSeen()) return false;
    markIntroSeen();
    return true;
  });

  useEffect(() => {
    marksStore.setScope(session.startedAt);
  }, [session.startedAt]);

  const examState = useAsync((signal) => getExam(signal), []);
  const exam = examState.data;
  const questions = exam?.questions ?? NO_QUESTIONS;

  const selectedId = pickedId ?? questions[0]?.id ?? null;

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void putFocus(selectedId, controller.signal).catch(() => {});
    return () => controller.abort();
  }, [selectedId]);

  const reviewMarked = confirmOpen
    ? questions.flatMap((q, i) =>
        marksStore.isMarked(q.id) ? [strings.exam.taskNumber(i + 1)] : [],
      )
    : [];
  const reviewUnseen = confirmOpen
    ? questions.flatMap((q, i) =>
        marksStore.isViewed(q.id) ? [] : [strings.exam.taskNumber(i + 1)],
      )
    : [];

  const handleConfirmEnd = async () => {
    setEnding(true);
    setEndError(null);
    try {
      const result = await endSession();
      if (result.ok) {
        setConfirmOpen(false);
        onSessionChange(result.session);
      } else {
        setEndError(result.error);
      }
    } catch (err) {
      setEndError(String(err));
    } finally {
      setEnding(false);
    }
  };

  const hosts = useMemo(() => {
    const seen = new Set<string>();
    for (const q of exam?.questions ?? []) if (q.instance) seen.add(q.instance);
    return [...seen].sort().join(", ");
  }, [exam]);

  // An inline element would be a new object on every render, which would
  // defeat QuestionPanel's memo on every session poll. `reload` is stable.
  const examError = examState.error;
  const examStatus = examState.status;
  const reloadExam = examState.reload;
  const questionsEmptyState = useMemo(
    () =>
      examStatus === "error" ? (
        <div className="pane-error" role="alert">
          <p className="error-text">{strings.exam.questionsFailed(examError ?? "")}</p>
          <button className="btn" onClick={reloadExam}>
            {strings.questionPanel.retry}
          </button>
        </div>
      ) : (
        <p className="question-empty-note">{strings.exam.loadingQuestions}</p>
      ),
    [examStatus, examError, reloadExam],
  );

  const desktopDownRef = useRef(false);
  const handleDesktopState = useCallback((state: string) => {
    if (state === "disconnected") {
      desktopDownRef.current = true;
      toastStore.push({
        kind: "warning",
        message: strings.toast.desktopReconnecting,
        dedupeKey: "desktop",
      });
    } else if (state === "connected" && desktopDownRef.current) {
      desktopDownRef.current = false;
      toastStore.push({
        kind: "info",
        message: strings.toast.desktopRestored,
        dedupeKey: "desktop",
      });
    }
  }, []);

  return (
    <div className="exam-layout">
      <TimerBar
        session={session}
        fetchedAt={fetchedAt}
        title={exam?.title ?? strings.exam.fallbackTitle}
        onEndClick={() => setConfirmOpen(true)}

        barExtras={
          <>
            {exam && (
              <span className="exam-env">
                {strings.exam.environment(exam.kubernetesVersion, hosts)}
              </span>
            )}
            {exam && exam.questions.length > 0 && <ExamProgress questions={exam.questions} />}
            <button
              className="info-button"
              onClick={() => setClipboardOpen((v) => !v)}
              aria-expanded={clipboardOpen}
              aria-label={strings.clipboard.open}
              title={strings.clipboard.open}
            >
              <Icon name="copy" />
            </button>

            {desktopKeymap.isMac && (
              <button
                className="info-button"
                onClick={() => setKeyboardOpen((v) => !v)}
                aria-expanded={keyboardOpen}
                aria-label={strings.keyboard.settingsLabel}
                title={strings.keyboard.settingsLabel}
              >
                <Icon name="keyboard" />
              </button>
            )}
          </>
        }
        extras={
          session.mode === "training" ? (
            <NavMenuItem
              icon="check"
              label={scoring ? strings.practice.scoring : strings.practice.scoreNow}
              onSelect={() => void scoreNow()}
            />
          ) : undefined
        }
      />
      <div className="exam-body">
        <QuestionPanel
          questions={questions}
          mode={session.mode}
          selectedId={selectedId}
          onSelect={setPickedId}
          emptyState={questionsEmptyState}
        />
        <PanelResizer panelId="question-panel" />

        <section className="desktop-pane" aria-label={strings.exam.desktopTitle}>
          {session.state === "running" && (
            <Suspense
              fallback={
                <div className="desktop-viewport">
                  <div className="desktop-status" role="status">
                    <p>{strings.desktop.connecting}</p>
                    <div className="desktop-status-bar">
                      <PendingBar />
                    </div>
                  </div>
                </div>
              }
            >
              <DesktopViewport onStateChange={handleDesktopState} />
            </Suspense>
          )}
        </section>
      </div>

      {confirmOpen && (
        <Dialog title={strings.exam.confirmTitle(session.mode)} onClose={() => setConfirmOpen(false)}>
          <p>{strings.exam.confirmBody(session.mode)}</p>

          {(reviewMarked.length > 0 || reviewUnseen.length > 0) && (
            <div className="submit-review">
              {reviewMarked.length > 0 && (
                <p>
                  {strings.exam.reviewMarked(reviewMarked.length)}{" "}
                  <span className="submit-review-ids">{reviewMarked.join(", ")}</span>
                </p>
              )}
              {reviewUnseen.length > 0 && (
                <p>
                  {strings.exam.reviewUnseen(reviewUnseen.length)}{" "}
                  <span className="submit-review-ids">{reviewUnseen.join(", ")}</span>
                </p>
              )}
            </div>
          )}
          {endError && <p className="error-text">{endError}</p>}
          <div className="confirm-actions">
            <button className="btn" onClick={() => setConfirmOpen(false)} disabled={ending}>
              {strings.exam.cancel}
            </button>
            <button className="btn btn-danger" onClick={handleConfirmEnd} disabled={ending}>
              {ending ? strings.exam.ending : strings.exam.endAttempt(session.mode)}
            </button>
          </div>
        </Dialog>
      )}

      {clipboardOpen && <ClipboardPanel onClose={() => setClipboardOpen(false)} />}
      {keyboardOpen && (
        <KeyboardSettings
          onClose={() => setKeyboardOpen(false)}
          onShowHelp={() => {
            setKeyboardOpen(false);
            setHelpOpen(true);
          }}
        />
      )}
      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
      {practice && (
        <Dialog title={strings.practice.title} onClose={() => setPractice(null)} wide>
          <p className="score-headline">
            {practice.earned} / {practice.total} ({practice.percent}%)
          </p>

          <p className="control-hint">{strings.practice.note}</p>
          {practice.questions.map((q) => (
            <details key={q.id} className="score-question">
              <summary>
                {strings.practice.questionScore(q.id, q.earned, q.total)}
              </summary>
              <CheckList checks={q.checks} />
            </details>
          ))}
          <div className="control-actions">
            <button className="btn" onClick={() => setPractice(null)}>
              {strings.practice.close}
            </button>
          </div>
        </Dialog>
      )}
      {introOpen && (
        <ExamIntro
          onClose={() => setIntroOpen(false)}
          durationSeconds={exam?.durationSeconds}
        />
      )}
    </div>
  );
}

function ExamProgress({ questions }: { questions: ExamQuestionInfo[] }) {
  useSyncExternalStore(marksStore.subscribe, marksStore.getVersion);

  const total = questions.length;
  const opened = questions.filter((q) => marksStore.isViewed(q.id)).length;
  const flagged = questions.filter((q) => marksStore.isMarked(q.id)).length;

  const fraction = total > 0 ? opened / total : 0;

  return (
    <div className="exam-progress">
      <span className="exam-progress-text">{strings.exam.progress(opened, total, flagged)}</span>
      <div className="exam-progress-track" aria-hidden="true">

        <div className="exam-progress-bar" style={{ transform: `scaleX(${fraction})` }} />
      </div>
    </div>
  );
}
