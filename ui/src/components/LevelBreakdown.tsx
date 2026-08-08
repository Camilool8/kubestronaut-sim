import type { LevelResult } from "../api";
import { strings } from "../strings";

interface LevelBreakdownProps {
  levels?: LevelResult[];
}

function percentOf(earned: number, total: number): number {
  return total > 0 ? Math.round((earned / total) * 100) : 0;
}

// Reads the shape rather than the ranking, so the rows stay in tier order: the
// useful signal is whether the score falls away as the tasks get longer.
export function LevelBreakdown({ levels }: LevelBreakdownProps) {
  const rows = (levels ?? []).filter((l) => l.total > 0);
  if (rows.length < 2) return null;

  const scored = rows.map((l) => ({ ...l, percent: percentOf(l.earned, l.total) }));
  const slumped = scored[0].percent - scored[scored.length - 1].percent >= 20;

  return (
    <section className="domain-breakdown level-breakdown">
      <h2>{strings.score.levelTitle}</h2>
      <p className="domain-hint">{strings.score.levelHint}</p>
      <ul className="domain-rows">
        {scored.map((l) => (
          <li key={l.level} className="domain-row">
            <div className="domain-row-head">
              <span className="domain-name">
                {strings.score.levelNames[l.level] ?? l.level}
              </span>
              <span className="domain-figure">{strings.score.percentValue(l.percent)}</span>
            </div>

            <span className="domain-bar" aria-hidden="true">
              <span className="domain-bar-fill" style={{ width: `${l.percent}%` }} />
            </span>
            <span className="domain-meta">
              {strings.score.levelMeta(l.questionCount, l.earned, l.total)}
            </span>
          </li>
        ))}
      </ul>
      <p className="domain-hint level-verdict">
        {slumped ? strings.score.levelSlump : strings.score.levelFlat}
      </p>
    </section>
  );
}
