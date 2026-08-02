import type { Results, SessionMode } from "../api";
import { formatSpan, rollupDomains, verdictOf, type DomainRow } from "./resultsModel";
import { strings } from "../strings";

interface ResultsBannerProps {
  results: Results;
  /**
   * The session's mode, for a result graded before `Results.mode` existed.
   * The result's own copy wins when it has one — it is the record of how
   * THIS attempt ran, where the prop is only what the app happens to
   * remember.
   */
  mode?: SessionMode;
  endReason: string;
}

/**
 * The ink banner: the verdict, in words, with everything it was measured
 * against on the same surface.
 *
 * --ink is a near-black band used INSIDE light mode (it inverts to a
 * raised band in dark). It is not --machine-*: this is the product
 * raising its voice, not a computer talking.
 *
 * Almost every field it reads is optional and its absence is a normal
 * case, not an error — a result graded before a field existed is
 * persisted verbatim in the session file and served back unchanged after
 * an upgrade. So the eyebrow, the prose and the second stat are all
 * assembled from what actually arrived rather than from a fixed shape
 * with holes punched in it.
 */
export function ResultsBanner({ results, mode, endReason }: ResultsBannerProps) {
  const attemptMode = results.mode || mode || "";
  // A draw narrowed to some domains covered part of the curriculum. It
  // cannot be reported as a pass however well it went, and the honest
  // display of that is this screen's job — the history rule that enforces
  // it server-side is a later step.
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
  // Only worth explaining when the two figures actually differ. Identical
  // numbers with a paragraph between them is noise.
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
          {/* The screen's h1. The verdict IS the heading now: it used to be
              a bare percentage with PASS underneath it, which split one
              sentence across two type sizes and left the threshold the
              verdict was measured against off the banner entirely. */}
          <h1 className="results-headline">{headline}</h1>
          {summary.length > 0 && <p className="results-summary">{summary.join(" ")}</p>}
        </div>

        {/* Two figures, not one. The weighted score is what the threshold
            is applied to; the second is whatever the result can actually
            support — the clock when it was recorded, the raw points when
            it was not. */}
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
        {/* Decorative, all of it: the percentage is in the headline and
            the threshold is in the scale below, so the bar adds emphasis
            and never information. --warn-marker is a decorative token
            (tokens.css) and reads 10.5:1 on --ink, which is why the
            threshold may be drawn with it AND must still be spelled out
            underneath. */}
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
        {/* A training attempt is untimed and had hints and solutions on
            tap; a mastery attempt ran on half the clock. Neither is a
            comparable result, and the banner is the one place a candidate
            will screenshot. */}
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
  // No clock on this result at all. Points are the one figure every
  // result has carried since the first one, so the block keeps its shape.
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

/** "14 of 20 tasks fully correct, 2 partially credited." */
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
  // 0 means untimed, which is training mode's whole point and not a
  // missing value.
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

/**
 * The graded date, in UTC.
 *
 * `gradedAt` is an RFC 3339 instant and the reader's zone would move the
 * printed day across a midnight for no benefit — this is a label on a
 * record, not an appointment. en-GB gives the brief's "1 Aug 2026"
 * ordering; the eyebrow sets it in caps.
 */
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
