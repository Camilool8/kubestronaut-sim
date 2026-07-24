import { useEffect, useState } from "react";
import { endSession, getExam, type ExamInfo, type SessionSnapshot } from "../api";
import { TimerBar } from "../components/TimerBar";
import { QuestionPanel } from "../components/QuestionPanel";

interface ExamProps {
  session: SessionSnapshot;
  fetchedAt: number;
  onSessionChange: (session: SessionSnapshot) => void;
}

// The desktop iframe's src, exact per the milestone design (§3/§5): the
// noVNC client autoconnects through the facilitator's same-origin
// /desktop reverse proxy so its WebSocket also flows through the proxy.
const DESKTOP_SRC =
  "/desktop/vnc.html?autoconnect=true&resize=remote&reconnect=true&path=desktop/websockify";

// Exam is only ever rendered by App while session.state === "running"
// (screen = f(state), no router) — so the moment End succeeds and
// App's session state flips to "ended", this whole component including
// its iframe unmounts. The `session.state === "running"` guard on the
// iframe itself is a second, redundant line of defense against ever
// rendering the iframe on a stale/non-running snapshot.
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
        title={exam?.title ?? "Exam"}
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
        <div className="desktop-pane">
          {session.state === "running" && (
            <iframe className="desktop-frame" title="Exam desktop" src={DESKTOP_SRC} />
          )}
        </div>
      </div>

      {confirmOpen && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <h2>End the exam?</h2>
            <p>
              This cannot be undone. The desktop will lock immediately and grading
              will begin.
            </p>
            {endError && <p className="error-text">{endError}</p>}
            <div className="confirm-actions">
              <button
                className="btn"
                onClick={() => setConfirmOpen(false)}
                disabled={ending}
              >
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleConfirmEnd} disabled={ending}>
                {ending ? "Ending…" : "End Exam"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
