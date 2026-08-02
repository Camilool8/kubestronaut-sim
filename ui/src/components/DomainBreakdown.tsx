import type { DomainResult, QuestionResult } from "../api";
import { rollupDomains } from "./resultsModel";
import { strings } from "../strings";

interface DomainBreakdownProps {
  questions: QuestionResult[];
  /**
   * The server's rollup, which is the only place the curriculum weight
   * lives. Absent on a result graded before it existed — persisted
   * verbatim in the session file and served back unchanged after an
   * upgrade — so its absence is a normal case, not an error, and the
   * component falls back to computing the same shape from `questions`.
   */
  domains?: DomainResult[];
  /** Marks the rows under the threshold. Omitted, no row is marked. */
  passingScore?: number;
}

/**
 * Score per curriculum domain — the results sidebar's first block.
 *
 * A percentage tells a candidate whether they passed; this tells them
 * what to study, which is the only thing a practice exam is actually for.
 *
 * Two sources, one shape. `results.domains` carries the server's
 * curriculum weighting and is preferred; without it the rollup is
 * recomputed from the questions, exactly as this component has always
 * done, and the copy drops its claim to be weighted rather than making
 * one it cannot back.
 */
export function DomainBreakdown({ questions, domains, passingScore }: DomainBreakdownProps) {
  const rows = rollupDomains(questions, domains);
  const weighted = rows.some((r) => r.weightPct !== undefined);

  if (rows.length === 0) return null;

  // The denominator of "1 of 4 tasks". The graded questions are the
  // authority; the rollup's own counts stand in for the (server
  // impossible, cheaply handled) case of a rollup with no questions
  // beside it.
  const taskTotal = questions.length || rows.reduce((sum, r) => sum + r.questionCount, 0);

  return (
    <section className="domain-breakdown">
      <h2>{strings.score.domainTitle}</h2>
      <p className="domain-hint">
        {weighted ? strings.score.domainHint : strings.score.domainHintUnweighted}
      </p>
      <ul className="domain-rows">
        {rows.map((r) => {
          // Colour is the SECOND signal here. The word under the bar is
          // the first, so a row reads the same in greyscale.
          const below = passingScore !== undefined && r.percent < passingScore;
          return (
            <li key={r.domain} className={below ? "domain-row is-below" : "domain-row"}>
              <div className="domain-row-head">
                <span className="domain-name">{r.domain}</span>
                <span className="domain-figure">{strings.score.percentValue(r.percent)}</span>
              </div>
              {/* Decorative: the figure above it and the meta below it
                  both carry the value, so this reads identically with CSS
                  off and needs no motion to be legible. */}
              <span className="domain-bar" aria-hidden="true">
                <span className="domain-bar-fill" style={{ width: `${r.percent}%` }} />
              </span>
              <span className="domain-meta">
                {r.weightPct === undefined
                  ? strings.score.domainMeta(r.questionCount, taskTotal, r.earned, r.total)
                  : strings.score.domainMetaWeighted(
                      Math.round(r.weightPct),
                      r.questionCount,
                      taskTotal,
                      r.earned,
                      r.total,
                    )}
                {below && <span className="domain-below">{strings.score.domainBelow}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
