import { useEffect, useRef, useState } from "react";
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
import { useTick } from "../lib/useTick";
import { strings } from "../strings";
import { Explain } from "./Explain";

const GRADING_POLL_MS = 3000;

interface ScoreProps {
  onNewAttempt: () => void;
  endReason: string;

  mode?: SessionMode;
}

export function Score({ onNewAttempt, endReason, mode }: ScoreProps) {
  const [starting, setStarting] = useState(false);
  const [response, setResponse] = useState<ResultsResponse>({ status: "grading" });

  const [pollError, setPollError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const [startedAt] = useState(() => Date.now());

  const route = useRoute();

  const [tipsOpen, setTipsOpen] = useState(false);
  const hasTips = useAsync((signal) => getExam(signal), []).data?.hasTips === true;

  const clearPoll = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const load = () =>
    getResults()
      .then((r) => {
        setPollError(null);
        setResponse(r);
        if (r.status === "ready" || r.status === "error") {
          clearPoll();
        }
      })

      .catch((err: unknown) => {
        setPollError(String(err));
      });

  useEffect(() => {
    load();
    intervalRef.current = window.setInterval(load, GRADING_POLL_MS);
    return clearPoll;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
