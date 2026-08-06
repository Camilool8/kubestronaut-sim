import type { CheckResult } from "../api";
import { Icon } from "./Icon";
import { strings } from "../strings";

interface CheckListProps {
  checks: CheckResult[];
}

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
          {checks.map((c) => {
            const state = c.skipped ? "skip" : c.passed ? "pass" : "fail";
            return (
              <tr key={c.name} className={`check-${state}`}>
                <td className="check-mark">
                  {c.skipped ? (
                    <span aria-hidden="true">·</span>
                  ) : (
                    <Icon name={c.passed ? "check" : "cross"} />
                  )}
                  <span className="sr-only">
                    {c.skipped
                      ? strings.score.checkSkipped
                      : c.passed
                        ? strings.score.checkPassed
                        : strings.score.checkFailed}
                  </span>
                </td>
                <td className="check-desc">{c.desc}</td>
                <td className="check-points">
                  {c.earned}/{c.points}
                </td>
                <td className="check-message">
                  {c.skipped ? strings.score.checkSkippedMessage : c.message}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
