import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { endSession, getExam, type ExamInfo, type SessionSnapshot } from "../api";
import { TimerBar } from "../components/TimerBar";
import { QuestionPanel } from "../components/QuestionPanel";
import { Dialog } from "../components/Dialog";
import { InfoButton } from "../components/InfoButton";
import { ExamIntro, introSeen, markIntroSeen } from "../components/ExamIntro";
import { toastStore } from "../components/toastStore";
import { formatClock, formatClockSpoken } from "../lib/format";
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

  // This is the only submit control a phone has. A discarded {ok:false}
  // (409) or a rejected fetch used to leave the button flicking back to
  // "End Exam" with nothing said, which reads exactly like a button that
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
          <span aria-hidden="true">{formatClock(remaining)}</span>
          <span className="sr-only">
            {strings.exam.timeRemaining(formatClockSpoken(remaining))}
          </span>
        </span>
      </p>
      <p>{strings.mobile.sessionRunning}</p>
      {endError && (
        <p className="error-text" role="alert">
          {endError}
        </p>
      )}
      <button className="btn btn-danger" onClick={end} disabled={ending}>
        {ending ? strings.exam.ending : strings.exam.endExam}
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
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  // First run shows the intro once; after that it is on demand from the
  // About drawer. Marked seen when it opens, not when it closes, so a
  // reload mid-read doesn't make it reappear over a running exam.
  const [introOpen, setIntroOpen] = useState(() => {
    if (introSeen()) return false;
    markIntroSeen();
    return true;
  });

  useEffect(() => {
    let cancelled = false;
    getExam()
      .then((e) => {
        if (cancelled) return;
        setExam(e);
        setSelectedId((current) => current ?? e.questions[0]?.id ?? null);
      })
      .catch(() => {
        // Non-fatal: the question panel just stays empty. The exam
        // itself (timer, desktop) still works without /api/exam.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        extras={<InfoButton onShowIntro={() => setIntroOpen(true)} />}
      />
      <div className="exam-body">
        <QuestionPanel
          questions={exam?.questions ?? []}
          selectedId={selectedId}
          onSelect={setSelectedId}
          open={panelOpen}
          onToggle={() => setPanelOpen((v) => !v)}
        />
        <div className="desktop-pane" aria-label={strings.exam.desktopTitle}>
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
                  </div>
                </div>
              }
            >
              <DesktopViewport onStateChange={handleDesktopState} />
            </Suspense>
          )}
        </div>
      </div>

      {confirmOpen && (
        <Dialog title={strings.exam.confirmTitle} onClose={() => setConfirmOpen(false)}>
          <p>{strings.exam.confirmBody}</p>
          {endError && <p className="error-text">{endError}</p>}
          <div className="confirm-actions">
            <button className="btn" onClick={() => setConfirmOpen(false)} disabled={ending}>
              {strings.exam.cancel}
            </button>
            <button className="btn btn-danger" onClick={handleConfirmEnd} disabled={ending}>
              {ending ? strings.exam.ending : strings.exam.endExam}
            </button>
          </div>
        </Dialog>
      )}

      {introOpen && <ExamIntro onClose={() => setIntroOpen(false)} />}
    </div>
  );
}
