import type { CheckResult } from "../api";
import { Icon } from "./Icon";
import { strings } from "../strings";

interface CheckListProps {
  checks: CheckResult[];
}

// Per-check rows for a graded question: pass/fail mark, description,
// earned/points, and the grader's message.
//
// The header row is visually hidden rather than absent: four unlabelled
// columns are unreadable to a screen reader, but a visible header would
// repeat itself under every question on the score page. The ✓/✗ glyph
// likewise carries a text equivalent, since result state must not rest
// on a symbol alone.
export function CheckList({ checks }: CheckListProps) {
  return (
    <div className="check-list-scroll">
      <table className="check-list">
        <thead className="sr-only">
          <tr>
            <th scope="col">{strings.score.checkResult}</th>
            <th scope="col">{strings.score.checkDescription}</th>
            <th scope="col">{strings.score.checkPoints}</th>
            <th scope="col">{strings.score.checkMessage}</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.name} className={c.passed ? "check-pass" : "check-fail"}>
              <td className="check-mark">
                <Icon name={c.passed ? "check" : "cross"} />
                <span className="sr-only">
                  {c.passed ? strings.score.checkPassed : strings.score.checkFailed}
                </span>
              </td>
              <td className="check-desc">{c.desc}</td>
              <td className="check-points">
                {c.earned}/{c.points}
              </td>
              <td className="check-message">{c.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
