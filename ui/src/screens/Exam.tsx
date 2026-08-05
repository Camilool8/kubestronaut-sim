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

// DesktopViewport pulls in @novnc/novnc, which is almost the entire main
// bundle. Statically imported it rode along on every screen that touches
// this module — the lobby, the score screen, and the mobile "desktop
// required" gate — none of which ever render a viewport. Worst case was a
// phone on the LAN downloading the whole VNC client just to be told it
// needs a desktop. Loading it lazily keeps it on the one path that uses it.
const DesktopViewport = lazy(() =>
  import("../components/DesktopViewport").then((m) => ({ default: m.DesktopViewport })),
);

interface ExamProps {
  session: SessionSnapshot;
  fetchedAt: number;
  onSessionChange: (session: SessionSnapshot) => void;
}

// Shown inside the "desktop required" screen when a session is already
// running. The server-side timer keeps counting whatever device the
// candidate happens to be holding, so the countdown and a way to submit
// have to remain reachable — otherwise opening the tab on a phone
// silently burns the attempt.
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

  // Untimed attempts count UP here too, for the reason TimerBar already
  // documents: an untimed session reports remainingSeconds 0, and a
  // frozen 0:00:00 is indistinguishable from an attempt that has run out.
  // This gate was the one path that missed that guard — a training user
  // who narrowed their window was shown an expired-looking clock and told
  // "the clock keeps going", which is the opposite of what training is.
  const untimed = session.untimed;
  const startedMs = session.startedAt ? Date.parse(session.startedAt) : NaN;
  const elapsed = Number.isNaN(startedMs) ? 0 : Math.max(0, now - startedMs);

  // This is the only submit control a phone has. A discarded {ok:false}
  // (409) or a rejected fetch used to leave the button flicking back to
  // "Submit exam" with nothing said, which reads exactly like a button that
  // does nothing — while the server-side clock keeps running.
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

// Exam is only ever rendered by App while session.state === "running"
// (screen = f(state), no router) — so the moment End succeeds and
// App's session state flips to "ended", this whole component including
// its RFB viewport unmounts, severing the live WebSocket client-side.
// The `session.state === "running"` guard on the viewport itself is a
// second, redundant line of defense against ever rendering it on a
// stale/non-running snapshot (the Go proxy independently 403s).
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

  // Training only. A mid-attempt score is exactly what an exam withholds,
  // and the endpoint 403s in the other two modes regardless.
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

  // "?" opens the shortcut reference. Guarded exactly like the [ and ]
  // handler in QuestionPanel: the RFB canvas owns the keyboard while
  // focused (the candidate is typing into a terminal), and a dialog that
  // is already open owns it too.
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
  // Clipboard mirroring runs for as long as the exam view is mounted, not
  // for as long as a viewport is connected: a candidate copies things
  // before the desktop finishes connecting, and the sync is a no-op until
  // there is somewhere to send them.
  useEffect(() => {
    clipboardSync.start();
    return () => clipboardSync.stop();
  }, []);
  // First run shows the intro once; after that it is on demand from the
  // About drawer. Marked seen when it opens, not when it closes, so a
  // reload mid-read doesn't make it reappear over a running exam.
  const [introOpen, setIntroOpen] = useState(() => {
    if (introSeen()) return false;
    markIntroSeen();
    return true;
  });

  // Scope the panel's viewed/marked flags to this attempt. startedAt
  // changes on every new attempt, so a fresh attempt starts clean without
  // anyone having to remember to clear — and a reload mid-exam keeps them,
  // which is the only thing they exist for.
  useEffect(() => {
    marksStore.setScope(session.startedAt);
  }, [session.startedAt]);

  // This used to swallow its error entirely, on the reasoning that the
  // timer and desktop work without /api/exam. They do — but a swallowed
  // failure renders an empty question panel, which is byte-identical to an
  // exam with no questions. A candidate five minutes into a 120-minute
  // clock got no explanation and nothing to retry. The failure is still
  // non-fatal; it is now visible and recoverable.
  const examState = useAsync((signal) => getExam(signal), []);
  const exam = examState.data;

  // Derived, not stored. The selection is "whatever the candidate picked,
  // or the first question" — holding that in state meant an effect writing
  // it the moment the exam landed, which is a render cascade for a value
  // that was always a function of two things already on hand.
  const selectedId = pickedId ?? exam?.questions[0]?.id ?? null;

  // Tell the server which task is on screen, so per-task time can be
  // accrued server-side (the client reports a question id and nothing
  // else; PUT /api/session/focus owns the arithmetic).
  //
  // Failure is a no-op in every direction: a facilitator too old to have
  // the route 404s, an ended attempt 409s, and a dropped request throws.
  // None of them may interrupt an attempt — this is telemetry, and a
  // candidate under a running clock must never be shown a toast about it.
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void putFocus(selectedId, controller.signal).catch(() => {});
    return () => controller.abort();
  }, [selectedId]);

  // Computed when the confirm dialog opens, not subscribed: the marks
  // store is only read here, and re-rendering the whole exam screen on
  // every mark toggle would be a lot of work for a list nobody is
  // looking at yet.
  // Listed as attempt positions ("Task 4"), never bank ids — the same
  // rule the mcq screen follows, and for the same reason: the ids are an
  // artifact of the draw, and every other part of this screen counts
  // tasks.
  const reviewMarked = confirmOpen
    ? (exam?.questions ?? []).flatMap((q, i) =>
        marksStore.isMarked(q.id) ? [strings.exam.taskNumber(i + 1)] : [],
      )
    : [];
  const reviewUnseen = confirmOpen
    ? (exam?.questions ?? []).flatMap((q, i) =>
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

  // Desktop connection health surfaces as toasts: sticky warning while
  // reconnecting, brief confirmation when it comes back.
  // The topbar's environment line. Both halves are server facts: the
  // cluster's Kubernetes version, and the boxes the DRAWN tasks name —
  // read off the questions rather than the bank's instance list, so a
  // drawn attempt advertises only the hosts it can actually send you to.
  const hosts = useMemo(() => {
    const seen = new Set<string>();
    for (const q of exam?.questions ?? []) if (q.instance) seen.add(q.instance);
    return [...seen].sort().join(", ");
  }, [exam]);

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
        // In the BAR, not the menu. These are reached every few minutes
        // while working, and this engine never renders narrow — the
        // device gate refuses a viewport that would need them collapsed.
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
            {/* Only where it does something: the translation is a macOS
                affordance, and a toggle that cannot change anything is
                worse than no toggle. */}
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
          questions={exam?.questions ?? []}
          mode={session.mode}
          selectedId={selectedId}
          onSelect={setPickedId}
          emptyState={
            examState.status === "error" ? (
              <div className="pane-error" role="alert">
                <p className="error-text">
                  {strings.exam.questionsFailed(examState.error ?? "")}
                </p>
                <button className="btn" onClick={examState.reload}>
                  {strings.questionPanel.retry}
                </button>
              </div>
            ) : (
              <p className="question-empty-note">{strings.exam.loadingQuestions}</p>
            )
          }
        />
        <PanelResizer panelId="question-panel" />
        {/* A section rather than a div: an aria-label on a role-less
            element is ignored by most assistive tech, so the label this
            already carried was doing nothing. */}
        <section className="desktop-pane" aria-label={strings.exam.desktopTitle}>
          {session.state === "running" && (
            // The fallback is the connecting state the viewport itself shows a
            // moment later, same markup: `.desktop-status` is out of flow, so
            // it needs `.desktop-viewport`'s positioned box to land in the
            // right place rather than over the whole page.
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
          {/* Submitting used to be a bare yes/no. The two things a
              candidate most wants to know at that moment — did I flag
              anything for another look, and is there a question I never
              opened — were both already tracked and never shown. Neither
              blocks the submit; a candidate who is out of time should not
              have to argue with a dialog. */}
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

      {/* position: fixed, so it is out of flow entirely. Anything that
          changes .desktop-pane's box fires noVNC's ResizeObserver and
          costs a server-side framebuffer resize — the reason QuestionJump
          is absolutely positioned too (see QuestionPanel). */}
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
          {/* Said out loud: a mid-attempt score is the number a candidate
              is most likely to over-read, and it is neither recorded nor
              final. */}
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

// How far through the tasks the attempt is, in the topbar.
//
// Its own component so it can subscribe to the marks store without
// re-rendering the exam screen — and with it the RFB viewport — on every
// flag. That was the reason the old code read the store only while the
// submit dialog was open; the reading is now on screen all the time, so
// the subscription moved down here instead of up there.
//
// "Opened" is the only word this screen is allowed: it knows it rendered
// a task's text, never that the work was done (components/marksStore.ts).
// The bar is aria-hidden — the sentence beside it already says the same
// thing, and a second voice reading a percentage adds nothing.
function ExamProgress({ questions }: { questions: ExamQuestionInfo[] }) {
  useSyncExternalStore(marksStore.subscribe, marksStore.getVersion);

  const total = questions.length;
  const opened = questions.filter((q) => marksStore.isViewed(q.id)).length;
  const flagged = questions.filter((q) => marksStore.isMarked(q.id)).length;
  // A fraction, not a rounded percent: scaleX takes one directly, and
  // rounding to whole percent threw away precision the bar can show.
  const fraction = total > 0 ? opened / total : 0;

  return (
    <div className="exam-progress">
      <span className="exam-progress-text">{strings.exam.progress(opened, total, flagged)}</span>
      <div className="exam-progress-track" aria-hidden="true">
        {/* scaleX rather than width — only transform and opacity animate
            without relayout. Same as .job-chip-bar-fill. */}
        <div className="exam-progress-bar" style={{ transform: `scaleX(${fraction})` }} />
      </div>
    </div>
  );
}
