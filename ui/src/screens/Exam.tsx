import { useEffect, useState } from "react";
import { endSession, getExam, type ExamInfo, type SessionSnapshot } from "../api";
import { TimerBar } from "../components/TimerBar";
import { QuestionPanel } from "../components/QuestionPanel";
import { DesktopViewport } from "../components/DesktopViewport";
import { strings } from "../strings";

interface ExamProps {
  session: SessionSnapshot;
  fetchedAt: number;
  onSessionChange: (session: SessionSnapshot) => void;
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

  return (
    <div className="exam-layout">
      <TimerBar
        session={session}
        fetchedAt={fetchedAt}
        title={exam?.title ?? strings.exam.fallbackTitle}
        onEndClick={() => setConfirmOpen(true)}
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
          {session.state === "running" && <DesktopViewport />}
        </div>
      </div>

      {confirmOpen && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <h2>{strings.exam.confirmTitle}</h2>
            <p>{strings.exam.confirmBody}</p>
            {endError && <p className="error-text">{endError}</p>}
            <div className="confirm-actions">
              <button
                className="btn"
                onClick={() => setConfirmOpen(false)}
                disabled={ending}
              >
                {strings.exam.cancel}
              </button>
              <button className="btn btn-danger" onClick={handleConfirmEnd} disabled={ending}>
                {ending ? strings.exam.ending : strings.exam.endExam}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
