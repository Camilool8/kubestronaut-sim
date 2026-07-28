import type { QuestionResult } from "../api";
import { strings } from "../strings";

interface DomainBreakdownProps {
  questions: QuestionResult[];
}

interface DomainRow {
  domain: string;
  earned: number;
  total: number;
  percent: number;
}

/**
 * Score per curriculum domain.
 *
 * Every ingredient already existed — `QuestionResult.Domain` comes back
 * on every result and the bank's points are derived from
 * `spec.domainWeights` — and nothing rendered it. A percentage tells a
 * candidate whether they passed; this tells them what to study, which is
 * the only thing a practice exam is actually for.
 *
 * Ordered worst-first, deliberately. Alphabetical would bury the one row
 * that should change what they do next.
 */
export function DomainBreakdown({ questions }: DomainBreakdownProps) {
  const byDomain = new Map<string, DomainRow>();
  for (const q of questions) {
    const domain = q.domain || strings.score.domainUnknown;
    const row = byDomain.get(domain) ?? { domain, earned: 0, total: 0, percent: 0 };
    row.earned += q.earned;
    row.total += q.total;
    byDomain.set(domain, row);
  }

  const rows = [...byDomain.values()]
    .map((r) => ({ ...r, percent: r.total === 0 ? 0 : Math.round((r.earned / r.total) * 100) }))
    .sort((a, b) => a.percent - b.percent || a.domain.localeCompare(b.domain));

  if (rows.length === 0) return null;

  return (
    <section className="domain-breakdown">
      <h2>{strings.score.domainTitle}</h2>
      <p className="control-hint">{strings.score.domainHint}</p>
      <table className="domain-table">
        <thead>
          <tr>
            <th>{strings.score.domainColumn}</th>
            <th>{strings.score.domainScore}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.domain}>
              <th scope="row">{r.domain}</th>
              <td>
                {/* The flex row is this wrapper, not the <td>. A flex table
                    cell leaves the table layout model and stops matching the
                    row height, which put this cell's border-bottom 2px above
                    the domain cell's and stepped every divider. */}
                <div className="domain-score">
                  {/* The bar is decorative; the numbers beside it carry the
                      value, so this reads identically with CSS off and
                      under reduced motion. */}
                  <span className="domain-bar" aria-hidden="true">
                    <span className="domain-bar-fill" style={{ width: `${r.percent}%` }} />
                  </span>
                  <span className="domain-figure">
                    {r.percent}% ({r.earned}/{r.total})
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
