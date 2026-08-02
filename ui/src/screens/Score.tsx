import { useEffect, useRef, useState } from "react";
import { endSession, getResults, type Results, type ResultsResponse, type SessionMode } from "../api";
import { DomainBreakdown } from "../components/DomainBreakdown";
import { PendingBar } from "../components/Pending";
import { ResultsBanner } from "../components/ResultsBanner";
import { rollupDomains } from "../components/resultsModel";
import { TaskVerdicts } from "../components/TaskVerdicts";
import { formatElapsed } from "../lib/format";
import { useTick } from "../lib/useTick";
import { strings } from "../strings";

const GRADING_POLL_MS = 3000;

interface ScoreProps {
  onNewAttempt: () => void;
  endReason: string;
  /** The attempt's mode, so a practice result never reads as an exam pass. */
  mode?: SessionMode;
}

// Score screen: while /api/results is 202 ("grading"), poll every 3s;
// on 500 (gradeError persisted), show the error with a Retry button
// that re-POSTs /api/session/end (the API re-grades an ended session
// without results — see §3); once 200, render the results — an ink
// banner carrying the verdict, a sidebar carrying the domain breakdown,
// and the per-task verdicts beside it — with a "New attempt" action that
// drives the conductor's reset (same code path as ./sim reset).
export function Score({ onNewAttempt, endReason, mode }: ScoreProps) {
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

  // Written as a promise chain rather than async/await on purpose. Every
  // setState here happens inside a callback the fetch resolves, which is
  // what an effect is allowed to do; `await` put the same calls in the
  // function's own body, where the compiler's set-state-in-effect rule
  // (correctly, from where it stands) could not tell them apart from a
  // synchronous cascade.
  const load = () =>
    getResults()
      .then((r) => {
        setPollError(null);
        setResponse(r);
        if (r.status === "ready" || r.status === "error") {
          clearPoll();
        }
      })
      // getResults() throws for any unexpected status, and the fetch
      // itself rejects while the facilitator restarts — which App treats
      // as a normal occurrence. Neither may render as "still grading" and
      // nothing else: the wait would be indistinguishable from progress.
      // The poll keeps running, so this clears itself when the server is
      // back; that is why it does not tear the poll down.
      .catch((err: unknown) => {
        setPollError(String(err));
      });

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
      <div className="results-card">
        <ResultsBanner results={results} mode={mode} endReason={endReason} />

        <div className="results-body">
          <aside className="results-aside">
            <DomainBreakdown
              questions={results.questions}
              domains={results.domains}
              passingScore={results.passingScore}
            />
            <NextSession results={results} />
          </aside>

          <TaskVerdicts questions={results.questions} />
        </div>
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

/**
 * What to do before the next attempt. Prose, NOT a control.
 *
 * The brief draws a "Drill weak domains" button here. `StartOptions`
 * already carries a `domains` filter and the server honours it, but
 * nothing in the UI sends one (Mode.tsx starts every attempt with a bare
 * mode), so that button would start an ordinary full-curriculum run —
 * a control that goes nowhere, which is worse than no control. Mode.tsx's
 * draw panel made the same call for the same reason.
 */
function NextSession({ results }: { results: Results }) {
  const rows = rollupDomains(results.questions, results.domains);
  if (rows.length === 0) return null;

  // Worst-first already, so the first two are the two that matter. More
  // than two "priorities" is no priority at all.
  const weak = rows.filter((r) => r.percent < results.passingScore).slice(0, 2);

  return (
    <div className="results-next">
      <h3>{strings.score.nextTitle}</h3>
      <p>
        {weak.length > 0
          ? strings.score.nextWeak(weak.map((r) => r.domain).join(strings.score.listSeparator))
          : strings.score.nextSolid}
      </p>
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
