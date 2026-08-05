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
  // This screen owns `#/results/<id>`, the explanation deep dive (1j).
  //
  // App.tsx does not change and does not need to: the visible screen is
  // still a function of session.state first, and this route only chooses
  // between views INSIDE `ended` — exactly as `#/exams/<id>/mode` chooses
  // between views inside `idle`. Read unconditionally, above every early
  // return, because it is a hook.
  const route = useRoute();

  // Whether this bank has tips to offer, which decides whether the
  // control below exists. One fetch, once, and a failure is silent: the
  // button is an offer, not a result, and a screen that has just finished
  // grading must not grow an error about a sidebar.
  const [tipsOpen, setTipsOpen] = useState(false);
  const hasTips = useAsync((signal) => getExam(signal), []).data?.hasTips === true;

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

  // Only `results/<something>` diverts. Any other fragment — none, a
  // stale `#/exams`, the bare `#/results` the deep dive's back link
  // writes — renders the results body exactly as it always has. An id
  // that names no question in this attempt is Explain's problem, not a
  // reason to blank the screen here.
  const explainId =
    route.segments[0] === "results" && route.segments.length > 1 ? route.segments[1] : null;

  if (explainId !== null) {
    return (
      // .score-screen carries the page-scroll override this screen needs
      // (`.screen:has(> .score-screen)`); .explain-screen narrows the
      // measure over it.
      <div className="score-screen explain-screen">
        {/* Keyed by the id: stepping to the next task is a fresh mount,
            so the previous task's reference solution can never be on
            screen under the next task's title while its fetch is still
            in flight. */}
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
        {/* This used to fire and change nothing until the 202 landed, so a
            slow conductor left the screen pixel-identical to before the
            click — and repeated clicks fired repeated POSTs. */}
        <button className="btn btn-primary" onClick={handleNewAttempt} disabled={starting}>
          {starting ? strings.control.starting : strings.control.newAttempt}
        </button>
        {/* Beside "New attempt" on purpose. This is the screen where a
            candidate finds out they ran out of time, and the tips are the
            answer to that rather than to any question they got wrong. */}
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

/**
 * What to do before the next attempt — and, when there is something worth
 * drilling, the control that starts it.
 *
 * This card was prose for two milestones because the button the brief
 * draws would have gone nowhere: nothing in the UI could send a domain
 * filter, so "drill these" started an ordinary full-curriculum run. The
 * mode screen's chips changed that, and the control is honest now.
 *
 * How it gets there is worth stating, because it looks like a missing
 * step. An ended session cannot start anything — `session.state` is the
 * outer switch, so navigating to the mode screen from here would render
 * this same screen — and the way back to `idle` is the conductor's reset,
 * which takes minutes. So the button does both: it writes the drill route
 * into the fragment and *then* asks for the reset. The route simply waits
 * there. When the session flips to idle, App reads the fragment it was
 * already carrying and opens the mode screen with these domains already
 * picked. Nothing has to be remembered across the rebuild, because the URL
 * is the thing remembering.
 *
 * If the reset is refused, the fragment is stale and harmless: this screen
 * ignores any route that is not `results/...`.
 */
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

  // Worst-first already, so the first two are the two that matter. More
  // than two "priorities" is no priority at all.
  const weak = rows.filter((r) => r.percent < results.passingScore).slice(0, 2);
  const names = weak.map((r) => r.domain);

  // A run already narrowed to some domains is not a base to narrow
  // further from: the weakest of two drilled domains is a thin signal, and
  // the dashboard — which reads every attempt — is the right place to
  // decide what to drill next.
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
          {/* The button rebuilds the environment before it can draw
              anything. Saying so here is the difference between a wait
              that was announced and one that just happened. */}
          <p className="results-next-hint">{strings.score.nextDrillHint}</p>
        </>
      )}
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
