import { getAttemptResults, type Results } from "../api";
import { Async } from "../components/Async";
import { DomainBreakdown } from "../components/DomainBreakdown";
import { ResultsBanner } from "../components/ResultsBanner";
import { TaskVerdicts } from "../components/TaskVerdicts";
import { formatAttemptDate } from "../lib/attemptHistory";
import { useAsync } from "../lib/useAsync";
import { strings } from "../strings";
import { Explain } from "./Explain";

interface ReviewProps {
  /** The attempt id from `#/history/<attemptId>`. */
  attemptId: string;
  /** The question from `#/history/<attemptId>/<questionId>`, if any. */
  questionId: string | null;
}

/**
 * A past attempt, read back whole.
 *
 * Hosted only, and the reason is a property of the local product rather
 * than a gap in it: a local facilitator records the attempt SUMMARY in
 * its state volume and keeps the full graded document in /session, which
 * the next attempt overwrites. The hub keeps both, because it exists
 * precisely so that nothing important dies with a Pod.
 *
 * Rendered by the same three components the end-of-exam screen uses, and
 * that is the point — a score means the same thing in October as it did
 * in August, so it should not be a different screen. The only thing this
 * adds is the line saying which of the two you are looking at.
 */
export function Review({ attemptId, questionId }: ReviewProps) {
  const state = useAsync<Results>((signal) => getAttemptResults(attemptId, signal), [attemptId]);

  return (
    <Async
      state={state}
      loading={<p className="page-loading">{strings.review.loading}</p>}
      error={(message, reload) => (
        <div className="catalog-error" role="alert">
          <p className="catalog-error-body">{strings.review.loadFailed(message)}</p>
          <button type="button" className="btn" onClick={reload}>
            {strings.review.retry}
          </button>
        </div>
      )}
    >
      {(results) =>
        questionId ? (
          <div className="score-screen explain-screen">
            {/* Keyed by the id for the same reason Score keys it: stepping
                to the next task must be a fresh mount, or the previous
                task's solution sits under the next task's title while its
                fetch is still in flight. */}
            <Explain
              key={questionId}
              results={results}
              questionId={questionId}
              basePath={`/history/${attemptId}`}
            />
          </div>
        ) : (
          <div className="score-screen">
            <div className="results-card">
              {/* Said before the banner, because everything below this
                  line is pixel-identical to the screen shown at the end
                  of a live exam and is not one. */}
              <p className="review-note" role="status">
                {strings.review.banner(formatAttemptDate(results.gradedAt))}
              </p>
              <ResultsBanner results={results} endReason="" />
              <div className="results-body">
                <aside className="results-aside">
                  <DomainBreakdown
                    questions={results.questions}
                    domains={results.domains}
                    passingScore={results.passingScore}
                  />
                </aside>
                {/* No "new attempt" and no drill button: this screen ends
                    nothing and starts nothing. The lobby is where a next
                    session begins, and it is one click away in the
                    header. */}
                <TaskVerdicts
                  questions={results.questions}
                  basePath={`/history/${attemptId}`}
                />
              </div>
            </div>
          </div>
        )
      }
    </Async>
  );
}
