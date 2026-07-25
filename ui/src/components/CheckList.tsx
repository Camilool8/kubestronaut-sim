import type { CheckResult } from "../api";

interface CheckListProps {
  checks: CheckResult[];
}

// Per-check rows for a graded question: pass/fail mark, description,
// earned/points, and the grader's message.
export function CheckList({ checks }: CheckListProps) {
  return (
    <div className="check-list-scroll">
      <table className="check-list">
      <tbody>
        {checks.map((c) => (
          <tr key={c.name} className={c.passed ? "check-pass" : "check-fail"}>
            <td className="check-mark">{c.passed ? "✓" : "✗"}</td>
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
