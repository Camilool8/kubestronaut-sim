import type { Results, SessionMode } from "../api";
import { formatSpan, rollupDomains, verdictOf, type DomainRow } from "./resultsModel";
import { strings } from "../strings";

interface ResultsBannerProps {
  results: Results;

  mode?: SessionMode;
  endReason: string;
}

export function ResultsBanner({ results, mode, endReason }: ResultsBannerProps) {
  const attemptMode = results.mode || mode || "";

  const filter = results.domainFilter ?? [];
  const filtered = filter.length > 0;

  const eyebrow = [results.bank];
  if (attemptMode !== "") {
    eyebrow.push(strings.score.runLabel(strings.modes[attemptMode].label));
  }
  const gradedOn = formatGradedAt(results.gradedAt);
  if (gradedOn) eyebrow.push(gradedOn);

  const headline = filtered
    ? strings.score.headlineFiltered(results.percent)
    : results.passed
      ? strings.score.headlinePass(results.percent, results.passingScore)
      : strings.score.headlineFail(results.percent, results.passingScore);

  const rows = rollupDomains(results.questions, results.domains);
  const summary = [
    taskSentence(results),
    clockSentence(results),
    weakSentence(rows, results.passingScore),
  ].filter((s): s is string => s !== null);

  const raw = results.pointsPercent;

  const showRaw = raw !== undefined && Math.round(raw) !== results.percent;

  return (
    <header className={`results-banner ${filtered ? "filtered" : results.passed ? "pass" : "fail"}`}>
      <div className="results-banner-top">
        <div className="results-banner-lead">
          <p className="results-eyebrow">
            {eyebrow.join(strings.score.eyebrowSeparator)}
            {results.seed && (
              <>
                {strings.score.eyebrowSeparator}
                {strings.score.drawSeedLabel}{" "}
                <span className="results-seed">{results.seed}</span>
              </>
            )}
          </p>

          <h1 className="results-headline">{headline}</h1>
          {summary.length > 0 && <p className="results-summary">{summary.join(" ")}</p>}
        </div>

        <div className="results-stats">
          <div className="results-stat">
            <span className="results-stat-figure">
              {strings.score.percentValue(results.percent)}
            </span>
            <span className="results-stat-label">{strings.score.statScore}</span>
          </div>
          <span className="results-stat-rule" aria-hidden="true" />
          <SecondStat results={results} />
        </div>
      </div>

      <div className="results-meter">

        <div className="results-meter-track" aria-hidden="true">
          <div className="results-meter-fill" style={{ width: `${clampPct(results.percent)}%` }} />
          <div
            className="results-meter-mark"
            style={{ left: `${clampPct(results.passingScore)}%` }}
          />
        </div>
        <div className="results-meter-scale">
          <span>{strings.score.meterFloor}</span>
          <span className="results-meter-pass">
            {strings.score.meterPass(results.passingScore)}
          </span>
          <span>{strings.score.meterCeiling}</span>
        </div>
      </div>

      <div className="results-notes">
        <p>{strings.score.pointsDetail(results.earned, results.total, results.passingScore)}</p>
        {showRaw && <p>{strings.score.weightedNote(Math.round(raw))}</p>}
        {filtered && <p>{strings.score.filteredNote(listDomains(filter))}</p>}

        {attemptMode !== "" && attemptMode !== "exam" && (
          <p className="score-mode">{strings.score.modeNote(strings.modes[attemptMode].label)}</p>
        )}
        {endReason && <p>{strings.score.endReason(endReason)}</p>}
      </div>
    </header>
  );
}

function SecondStat({ results }: { results: Results }) {
  const elapsed = results.elapsedSeconds;
  const duration = results.durationSeconds;

  if (elapsed !== undefined && duration !== undefined && duration > 0) {
    return (
      <Stat figure={formatSpan(elapsed)} label={strings.score.statTimeUsed(formatSpan(duration))} />
    );
  }
  if (elapsed !== undefined) {
    return <Stat figure={formatSpan(elapsed)} label={strings.score.statTimeOpen} />;
  }

  return <Stat figure={`${results.earned}/${results.total}`} label={strings.score.statPoints} />;
}

function Stat({ figure, label }: { figure: string; label: string }) {
  return (
    <div className="results-stat">
      <span className="results-stat-figure">{figure}</span>
      <span className="results-stat-label">{label}</span>
    </div>
  );
}

function taskSentence(results: Results): string | null {
  if (results.questions.length === 0) return null;
  let correct = 0;
  let partial = 0;
  for (const q of results.questions) {
    const v = verdictOf(q.verdict, q.earned, q.total);
    if (v === "correct") correct++;
    else if (v === "partial") partial++;
  }
  return strings.score.summaryTasks(correct, partial, results.questions.length);
}

function clockSentence(results: Results): string | null {
  const { durationSeconds: duration, elapsedSeconds: elapsed } = results;
  if (duration === undefined) return null;

  if (duration === 0) return strings.score.summaryUntimed;
  if (elapsed === undefined) return null;
  const left = duration - elapsed;
  return left > 0
    ? strings.score.summaryTimeLeft(formatSpan(left), formatSpan(duration))
    : strings.score.summaryTimeAll(formatSpan(duration));
}

function weakSentence(rows: DomainRow[], passingScore: number): string | null {
  if (rows.length === 0) return null;
  const below = rows.filter((r) => r.percent < passingScore);
  if (below.length === 0) return strings.score.summaryWeakNone(passingScore);
  if (below.length === 1) return strings.score.summaryWeakOne(below[0].domain, passingScore);
  return strings.score.summaryWeakMany(below.length, passingScore);
}

function listDomains(domains: string[]): string {
  return domains.join(strings.score.listSeparator);
}

function formatGradedAt(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}
