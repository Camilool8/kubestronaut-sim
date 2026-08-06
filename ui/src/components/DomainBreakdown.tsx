import type { DomainResult, QuestionResult } from "../api";
import { rollupDomains } from "./resultsModel";
import { strings } from "../strings";

interface DomainBreakdownProps {
  questions: QuestionResult[];

  domains?: DomainResult[];

  passingScore?: number;
}

export function DomainBreakdown({ questions, domains, passingScore }: DomainBreakdownProps) {
  const rows = rollupDomains(questions, domains);
  const weighted = rows.some((r) => r.weightPct !== undefined);

  if (rows.length === 0) return null;

  const taskTotal = questions.length || rows.reduce((sum, r) => sum + r.questionCount, 0);

  return (
    <section className="domain-breakdown">
      <h2>{strings.score.domainTitle}</h2>
      <p className="domain-hint">
        {weighted ? strings.score.domainHint : strings.score.domainHintUnweighted}
      </p>
      <ul className="domain-rows">
        {rows.map((r) => {
          const below = passingScore !== undefined && r.percent < passingScore;
          return (
            <li key={r.domain} className={below ? "domain-row is-below" : "domain-row"}>
              <div className="domain-row-head">
                <span className="domain-name">{r.domain}</span>
                <span className="domain-figure">{strings.score.percentValue(r.percent)}</span>
              </div>

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
