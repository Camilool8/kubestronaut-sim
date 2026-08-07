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
          {checks.flatMap((c) => {
            const state = c.skipped ? "skip" : c.passed ? "pass" : "fail";

            // Only a check that did not simply pass earns the breakdown; on a
            // full-marks check the criterion rows say nothing the score does
            // not already say.
            const criteria = c.passed || c.skipped ? [] : (c.criteria ?? []);

            return [
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
              </tr>,
              ...criteria.map((cr, i) => (
                <tr
                  key={`${c.name}:criterion:${i}`}
                  className={`check-criterion criterion-${cr.passed ? "pass" : "fail"}`}
                >
                  <td className="check-mark">
                    <Icon name={cr.passed ? "check" : "cross"} />
                    <span className="sr-only">
                      {cr.passed
                        ? strings.score.checkPassed
                        : strings.score.checkFailed}
                    </span>
                  </td>
                  <td className="check-desc" colSpan={3}>
                    {cr.desc}
                  </td>
                </tr>
              )),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
