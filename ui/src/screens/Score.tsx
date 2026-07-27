import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import {
  endSession,
  getResults,
  getSolution,
  type QuestionResult,
  type ResultsResponse,
  type SolutionDetail,
} from "../api";
import { CheckList } from "../components/CheckList";
import { Icon } from "../components/Icon";
import { Markdown } from "../components/Markdown";
import { PendingBar } from "../components/Pending";
import { formatElapsed } from "../lib/format";
import { useTick } from "../lib/useTick";
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
  // Released by this screen unmounting when the reset job flips the session
  // back to idle; a refused job leaves it set only until the toast App
  // raises is dismissed and the user tries again, which is the correct
  // read — the request really is still outstanding.
  const [starting, setStarting] = useState(false);
  const [response, setResponse] = useState<ResultsResponse>({ status: "grading" });
  // A poll that failed to reach the facilitator at all — distinct from a
  // grading error the facilitator reported. It is not terminal (the next
  // tick usually clears it), so it annotates the waiting screen instead
  // of replacing it.
  const [pollError, setPollError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  // Anchored at mount, which is when the session ended and grading began.
  const [startedAt] = useState(() => Date.now());

  const clearPoll = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const load = async () => {
    try {
      const r = await getResults();
      setPollError(null);
      setResponse(r);
      if (r.status === "ready" || r.status === "error") {
        clearPoll();
      }
    } catch (err) {
      // getResults() throws for any unexpected status, and the fetch
      // itself rejects while the facilitator restarts — which App treats
      // as a normal occurrence. Neither may render as "still grading" and
      // nothing else: the wait would be indistinguishable from progress.
      // The poll keeps running, so this clears itself when the server is
      // back; that is why it does not tear the poll down.
      setPollError(String(err));
    }
  };

  useEffect(() => {
    load();
    intervalRef.current = window.setInterval(load, GRADING_POLL_MS);
    return clearPoll;
    // Poll lifecycle is intentionally mount-only; `load` reads no props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry re-POSTs /api/session/end to ask for a re-grade. clearPoll()
  // already ran when the status became "error", so this is the only path
  // back: if the request fails, the error and this button must both come
  // back. Skipping them left the screen on "Grading…" with no poll armed
  // and no way out but a page reload — immediately after a timed exam.
  const handleRetry = async () => {
    setResponse({ status: "grading" });
    setPollError(null);
    try {
      const result = await endSession();
      if (!result.ok) {
        setResponse({ status: "error", message: strings.score.retryFailed(result.error) });
        return;
      }
      await load();
    } catch (err) {
      setResponse({ status: "error", message: strings.score.retryFailed(String(err)) });
      return;
    }
    if (intervalRef.current === null) {
      intervalRef.current = window.setInterval(load, GRADING_POLL_MS);
    }
  };

  const handleNewAttempt = () => {
    setStarting(true);
    onNewAttempt();
  };

  if (response.status === "grading" || response.status === "not-ended") {
    return <Grading startedAt={startedAt} pollError={pollError} />;
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
        <h1 className="score-percent">
          <span className="sr-only">{strings.score.scoreLabel}: </span>
          {results.percent}%
        </h1>
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
        {/* This used to fire and change nothing until the 202 landed, so a
            slow conductor left the screen pixel-identical to before the
            click — and repeated clicks fired repeated POSTs. */}
        <button className="btn btn-primary" onClick={handleNewAttempt} disabled={starting}>
          {starting ? strings.control.starting : strings.control.newAttempt}
        </button>
        <p className="score-actions-hint">{strings.control.newAttemptHint}</p>
      </div>
    </div>
  );
}

// This was the longest fully-static wait in the product: a heading, one
// paragraph, and a 3s poll behind it. Nothing on screen changed for the
// whole grade, which is exactly how a normal wait starts reading as a hang.
//
// Two signals now, and the order matters. The elapsed counter is the one
// that carries the state WITHOUT motion — it ticks identically whether or
// not the user accepts animation, which the bar underneath does not. The
// bar is the enhancement, never the only evidence.
function Grading({ startedAt, pollError }: { startedAt: number; pollError: string | null }) {
  const now = useTick(true);

  return (
    <div className="score-screen score-loading">
      <h1>{strings.score.gradingTitle}</h1>
      <p>{strings.score.gradingBody}</p>
      <div className="score-loading-progress">
        <PendingBar label={strings.score.gradingTitle} />
        {/* aria-hidden and mono/tabular, matching the control overlay: a
            clock that re-announces every second buries the status line
            that actually changed. */}
        <p className="score-loading-elapsed" aria-hidden="true">
          {strings.control.elapsed(formatElapsed(now - startedAt))}
        </p>
      </div>
      {pollError && (
        <p className="error-text" role="status">
          {strings.score.pollFailed(pollError)}
        </p>
      )}
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
        <Icon name="chevron-down" className="disclosure-chevron" />
        <span className="qr-id">{question.id}</span>
        <span className="qr-domain">{question.domain}</span>
        <span className="qr-points">
          {question.earned}/{question.total}
        </span>
      </summary>
      <CheckList checks={question.checks} />
      <details className="solution-details" onToggle={handleToggle}>
        <summary>
          <Icon name="chevron-down" className="disclosure-chevron" />
          {strings.score.showSolution}
        </summary>
        {loadingSolution && <p>{strings.score.loadingSolution}</p>}
        {solutionError && <p className="error-text">{solutionError}</p>}
        {solution && <Markdown>{solution.markdown}</Markdown>}
      </details>
    </details>
  );
}
