import { useRef, useState } from "react";
import {
  endSession,
  getExam,
  getResults,
  type Results,
  type ResultsResponse,
  type SessionMode,
} from "../api";
import { DomainBreakdown } from "../components/DomainBreakdown";
import { LevelBreakdown } from "../components/LevelBreakdown";
import { ExamTips } from "../components/ExamTips";
import { PendingBar } from "../components/Pending";
import { ResultsBanner } from "../components/ResultsBanner";
import { rollupDomains } from "../components/resultsModel";
import { TaskVerdicts } from "../components/TaskVerdicts";
import { drillHref } from "../lib/attemptHistory";
import { formatElapsed } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { navigate, useRoute } from "../lib/useHashRoute";
import { usePoll } from "../lib/usePoll";
import { useTick } from "../lib/useTick";
import { strings } from "../strings";
import { Explain } from "./Explain";

export const GRADING_POLL_MS = 3000;

// Grading lands in well under a minute, and the poll only runs while the tab
// is in front of the candidate, so this is five minutes of watched waiting —
// far past any real run, and short of forever. Without it a facilitator that
// answers 202 and then wedges leaves this screen spinning for the rest of the
// day with nothing to click.
export const GRADING_POLL_MAX_ATTEMPTS = 100;

interface ScoreProps {
  onNewAttempt: () => void;
  endReason: string;

  mode?: SessionMode;
}

export function Score({ onNewAttempt, endReason, mode }: ScoreProps) {
  const [starting, setStarting] = useState(false);
  const [response, setResponse] = useState<ResultsResponse>({ status: "grading" });

  const [pollError, setPollError] = useState<string | null>(null);
  const [polling, setPolling] = useState(true);

  // Counted rather than timed: the poll pauses in a background tab, so a
  // candidate who alt-tabs away spends none of the allowance.
  const attempts = useRef(0);
  const lastError = useRef<string | null>(null);

  const [startedAt] = useState(() => Date.now());

  const route = useRoute();

  const [tipsOpen, setTipsOpen] = useState(false);
  const hasTips = useAsync((signal) => getExam(signal), []).data?.hasTips === true;

  const load = async () => {
    attempts.current += 1;
    try {
      const r = await getResults();
      lastError.current = null;
      setPollError(null);
      setResponse(r);
      if (r.status === "ready" || r.status === "error") {
        setPolling(false);
        return;
      }
    } catch (err: unknown) {
      lastError.current = String(err);
      setPollError(String(err));
    }

    if (attempts.current >= GRADING_POLL_MAX_ATTEMPTS) {
      setPolling(false);
      setResponse({
        status: "error",
        message: strings.score.gradingTimedOut(
          lastError.current ?? formatElapsed(GRADING_POLL_MS * GRADING_POLL_MAX_ATTEMPTS),
        ),
      });
    }
  };

  usePoll(load, GRADING_POLL_MS, { enabled: polling });

  const handleRetry = async () => {
    setResponse({ status: "grading" });
    setPollError(null);
    try {
      const result = await endSession();
      if (!result.ok) {
        setResponse({ status: "error", message: strings.score.retryFailed(result.error) });
        return;
      }
    } catch (err) {
      setResponse({ status: "error", message: strings.score.retryFailed(String(err)) });
      return;
    }

    // A retry is a fresh wait, not a continuation of the one that ran out.
    attempts.current = 0;
    lastError.current = null;
    setPolling(true);
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

  const explainId =
    route.segments[0] === "results" && route.segments.length > 1 ? route.segments[1] : null;

  if (explainId !== null) {
    return (
      <div className="score-screen explain-screen">

        <Explain key={explainId} results={results} questionId={explainId} />
      </div>
    );
  }

  return (
    <div className="score-screen">
      <div className="results-card">
        <ResultsBanner results={results} mode={mode} endReason={endReason} />

        <div className="results-body">
          <aside className="results-aside">
            <DomainBreakdown
              questions={results.questions}
              domains={results.domains}
              passingScore={results.passingScore}
            />
            <LevelBreakdown levels={results.levels} />
            <NextSession
              results={results}
              starting={starting}
              onDrill={handleNewAttempt}
            />
          </aside>

          <TaskVerdicts questions={results.questions} />
        </div>
      </div>

      <div className="score-actions">

        <button className="btn btn-primary" onClick={handleNewAttempt} disabled={starting}>
          {starting ? strings.control.starting : strings.control.newAttempt}
        </button>

        {hasTips && (
          <button type="button" className="btn" onClick={() => setTipsOpen(true)}>
            {strings.tips.open}
          </button>
        )}
        <p className="score-actions-hint">{strings.control.newAttemptHint}</p>
      </div>

      {tipsOpen && <ExamTips onClose={() => setTipsOpen(false)} />}
    </div>
  );
}

function NextSession({
  results,
  starting,
  onDrill,
}: {
  results: Results;
  starting: boolean;
  onDrill: () => void;
}) {
  const rows = rollupDomains(results.questions, results.domains);
  if (rows.length === 0) return null;

  const weak = rows.filter((r) => r.percent < results.passingScore).slice(0, 2);
  const names = weak.map((r) => r.domain);

  const filtered = (results.domainFilter?.length ?? 0) > 0;

  const drill = () => {
    navigate(drillHref(results.bank, names));
    onDrill();
  };

  return (
    <div className="results-next">
      <h3>{strings.score.nextTitle}</h3>
      <p>
        {names.length > 0
          ? strings.score.nextWeak(names.join(strings.score.listSeparator))
          : strings.score.nextSolid}
      </p>
      {names.length > 0 && !filtered && (
        <>
          <button type="button" className="btn results-next-drill" onClick={drill} disabled={starting}>
            {starting ? strings.control.starting : strings.score.nextDrill}
          </button>

          <p className="results-next-hint">{strings.score.nextDrillHint}</p>
        </>
      )}
    </div>
  );
}

function Grading({ startedAt, pollError }: { startedAt: number; pollError: string | null }) {
  const now = useTick(true);

  return (
    <div className="score-screen score-loading">
      <h1>{strings.score.gradingTitle}</h1>
      <p>{strings.score.gradingBody}</p>
      <div className="score-loading-progress">
        <PendingBar label={strings.score.gradingTitle} />

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
