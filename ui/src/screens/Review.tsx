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
  attemptId: string;

  questionId: string | null;
}

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

            <Explain
              key={questionId}
              results={results}
              questionId={questionId}
              basePath={`/history/${attemptId}`}
              live={false}
            />
          </div>
        ) : (
          <div className="score-screen">
            <div className="results-card">

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
