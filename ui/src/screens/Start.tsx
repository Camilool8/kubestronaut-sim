import { useEffect, useState } from "react";
import { getExam, getSession, startSession, type ExamInfo, type SessionSnapshot } from "../api";

interface StartProps {
  onSessionChange: (session: SessionSnapshot) => void;
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Start screen: exam summary pulled from GET /api/exam, plus a Start
// button. A 409 from POST /api/session/start (e.g. a concurrent start,
// or the poller having just observed the exam began) is handled by
// refetching the authoritative session state rather than showing an
// error — App will then route to whatever screen that state implies.
export function Start({ onSessionChange }: StartProps) {
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [examError, setExamError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getExam()
      .then((e) => {
        if (!cancelled) setExam(e);
      })
      .catch((err) => {
        if (!cancelled) setExamError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStart = async () => {
    setStarting(true);
    setStartError(null);
    try {
      const result = await startSession();
      if (result.ok) {
        onSessionChange(result.session);
      } else {
        // Someone/something already changed session state (409) —
        // refetch and let App re-derive the screen from the truth.
        const current = await getSession();
        onSessionChange(current);
      }
    } catch (err) {
      setStartError(String(err));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="start-screen">
      <div className="start-card">
        <h1>{exam?.title ?? "kubestronaut-sim"}</h1>
        {examError && <p className="error-text">{examError}</p>}

        {exam && (
          <div className="start-stats">
            <div>
              <div className="start-stat-label">Duration</div>
              <div className="start-stat-value">{formatDuration(exam.durationSeconds)}</div>
            </div>
            <div>
              <div className="start-stat-label">Passing score</div>
              <div className="start-stat-value">{exam.passingScore}%</div>
            </div>
            <div>
              <div className="start-stat-label">Questions</div>
              <div className="start-stat-value">{exam.questions.length}</div>
            </div>
            <div>
              <div className="start-stat-label">Kubernetes</div>
              <div className="start-stat-value">{exam.kubernetesVersion}</div>
            </div>
          </div>
        )}

        <ul className="start-tips">
          <li>Solve questions over SSH on the named instance (user: candidate).</li>
          <li>The desktop's Firefox is for documentation only — no copy/paste answers.</li>
          <li>Each question has a working directory pre-created at /opt/course/&lt;n&gt;.</li>
          <li>The timer starts the moment you click Start and cannot be paused.</li>
        </ul>

        {startError && <p className="error-text">{startError}</p>}

        <div className="start-actions">
          <button className="btn btn-primary" onClick={handleStart} disabled={starting}>
            {starting ? "Starting…" : "Start Exam"}
          </button>
        </div>
      </div>
    </div>
  );
}
