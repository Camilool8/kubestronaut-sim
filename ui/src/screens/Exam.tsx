import { useCallback, useEffect, useRef, useState } from "react";
import { endSession, getExam, type ExamInfo, type SessionSnapshot } from "../api";
import { TimerBar } from "../components/TimerBar";
import { QuestionPanel } from "../components/QuestionPanel";
import { DesktopViewport } from "../components/DesktopViewport";
import { Dialog } from "../components/Dialog";
import { InfoButton } from "../components/InfoButton";
import { Tour, markTourSeen, resetTourSeen, tourSeen, type TourStep } from "../components/Tour";
import { toastStore } from "../components/toastStore";
import { strings } from "../strings";

interface ExamProps {
  session: SessionSnapshot;
  fetchedAt: number;
  onSessionChange: (session: SessionSnapshot) => void;
}

const TOUR_STEPS: TourStep[] = [
  { target: ".question-panel", ...strings.tour.steps.questions },
  { target: ".timer", ...strings.tour.steps.timer },
  { target: ".desktop-pane", ...strings.tour.steps.desktop },
  { target: ".btn-danger", ...strings.tour.steps.end },
];

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
  const [tourOpen, setTourOpen] = useState(() => !tourSeen());

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

  const restartTour = () => {
    resetTourSeen();
    setTourOpen(true);
  };

  return (
    <div className="exam-layout">
      <TimerBar
        session={session}
        fetchedAt={fetchedAt}
        title={exam?.title ?? strings.exam.fallbackTitle}
        onEndClick={() => setConfirmOpen(true)}
        extras={<InfoButton onRestartTour={restartTour} />}
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
            <DesktopViewport onStateChange={handleDesktopState} />
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

      {tourOpen && (
        <Tour
          steps={TOUR_STEPS}
          onDone={() => {
            markTourSeen();
            setTourOpen(false);
          }}
        />
      )}
    </div>
  );
}
