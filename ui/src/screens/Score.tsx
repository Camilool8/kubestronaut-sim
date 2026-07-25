import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import ReactMarkdown from "react-markdown";
import {
  endSession,
  getResults,
  getSolution,
  type QuestionResult,
  type ResultsResponse,
  type SolutionDetail,
} from "../api";
import { CheckList } from "../components/CheckList";
import { strings } from "../strings";

const GRADING_POLL_MS = 3000;

interface ScoreProps {
  onNewAttempt: () => void;
  endReason: string;
}

// Score screen: while /api/results is 202 ("grading"), poll every 3s;
// on 500 (gradeError persisted), show the error with a Retry button
// that re-POSTs /api/session/end (the API re-grades an ended session
// without results — see §3); once 200, render the scoreboard with a
// "New attempt" action that drives the conductor's reset (same code
// path as ./sim reset).
export function Score({ onNewAttempt, endReason }: ScoreProps) {
  const [response, setResponse] = useState<ResultsResponse>({ status: "grading" });
  const intervalRef = useRef<number | null>(null);

  const clearPoll = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const load = async () => {
    const r = await getResults();
    setResponse(r);
    if (r.status === "ready" || r.status === "error") {
      clearPoll();
    }
  };

  useEffect(() => {
    load();
    intervalRef.current = window.setInterval(load, GRADING_POLL_MS);
    return clearPoll;
    // Poll lifecycle is intentionally mount-only; `load` reads no props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = async () => {
    setResponse({ status: "grading" });
    await endSession();
    await load();
    if (intervalRef.current === null) {
      intervalRef.current = window.setInterval(load, GRADING_POLL_MS);
    }
  };

  if (response.status === "grading" || response.status === "not-ended") {
    return (
      <div className="score-screen score-loading">
        <h1>{strings.score.gradingTitle}</h1>
        <p>{strings.score.gradingBody}</p>
      </div>
    );
  }

  if (response.status === "error") {
    return (
      <div className="score-screen score-error">
        <h1>{strings.score.gradingFailedTitle}</h1>
        <p className="error-text">{response.message}</p>
        <button className="btn btn-primary" onClick={handleRetry}>
          {strings.score.retry}
        </button>
      </div>
    );
  }

  const { results } = response;

  return (
    <div className="score-screen">
      <div className={`score-banner ${results.passed ? "pass" : "fail"}`}>
        <div className="score-percent">{results.percent}%</div>
        <div className="score-verdict">{results.passed ? strings.score.pass : strings.score.fail}</div>
        <div className="score-detail">
          {strings.score.pointsDetail(results.earned, results.total, results.passingScore)}
        </div>
        {endReason && (
          <div className="score-end-reason">{strings.score.endReason(endReason)}</div>
        )}
      </div>

      <div className="score-questions">
        {results.questions.map((q) => (
          <QuestionResultDetails key={q.id} question={q} />
        ))}
      </div>

      <div className="score-actions">
        <button className="btn btn-primary" onClick={onNewAttempt}>
          {strings.control.newAttempt}
        </button>
        <p className="score-actions-hint">{strings.control.newAttemptHint}</p>
      </div>
    </div>
  );
}

function QuestionResultDetails({ question }: { question: QuestionResult }) {
  const [solution, setSolution] = useState<SolutionDetail | null>(null);
  const [solutionError, setSolutionError] = useState<string | null>(null);
  const [loadingSolution, setLoadingSolution] = useState(false);
  const [fetched, setFetched] = useState(false);

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open || fetched) return;
    setFetched(true);
    setLoadingSolution(true);
    getSolution(question.id)
      .then((r) => {
        if (r.ok) {
          setSolution(r.solution);
        } else {
          setSolutionError(r.error);
        }
      })
      .catch((err) => setSolutionError(String(err)))
      .finally(() => setLoadingSolution(false));
  };

  return (
    <details className="question-result">
      <summary>
        <span className="qr-id">{question.id}</span>
        <span className="qr-domain">{question.domain}</span>
        <span className="qr-points">
          {question.earned}/{question.total}
        </span>
      </summary>
      <CheckList checks={question.checks} />
      <details className="solution-details" onToggle={handleToggle}>
        <summary>{strings.score.showSolution}</summary>
        {loadingSolution && <p>{strings.score.loadingSolution}</p>}
        {solutionError && <p className="error-text">{solutionError}</p>}
        {solution && <ReactMarkdown>{solution.markdown}</ReactMarkdown>}
      </details>
    </details>
  );
}
