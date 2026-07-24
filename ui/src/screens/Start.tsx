import { useEffect, useState } from "react";
import { getExam, getSession, startSession, type ExamInfo, type SessionSnapshot } from "../api";
import { formatDuration } from "../lib/format";
import { strings } from "../strings";

interface StartProps {
  onSessionChange: (session: SessionSnapshot) => void;
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
        <h1>{exam?.title ?? strings.start.fallbackTitle}</h1>
        {examError && <p className="error-text">{examError}</p>}

        {exam && (
          <div className="start-stats">
            <div>
              <div className="start-stat-label">{strings.start.durationLabel}</div>
              <div className="start-stat-value">{formatDuration(exam.durationSeconds)}</div>
            </div>
            <div>
              <div className="start-stat-label">{strings.start.passingScoreLabel}</div>
              <div className="start-stat-value">{exam.passingScore}%</div>
            </div>
            <div>
              <div className="start-stat-label">{strings.start.questionsLabel}</div>
              <div className="start-stat-value">{exam.questions.length}</div>
            </div>
            <div>
              <div className="start-stat-label">{strings.start.kubernetesLabel}</div>
              <div className="start-stat-value">{exam.kubernetesVersion}</div>
            </div>
          </div>
        )}

        <ul className="start-tips">
          {strings.start.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>

        {startError && <p className="error-text">{startError}</p>}

        <div className="start-actions">
          <button className="btn btn-primary" onClick={handleStart} disabled={starting}>
            {starting ? strings.start.starting : strings.start.startExam}
          </button>
        </div>
      </div>
    </div>
  );
}
