import { getExamTips } from "../api";
import { useAsync } from "../lib/useAsync";
import { Async } from "./Async";
import { Dialog } from "./Dialog";
import { Markdown } from "./Markdown";
import { strings } from "../strings";

/**
 * The bank's exam technique notes, as a sheet.
 *
 * Technique rather than answers, which is why the endpoint behind it is
 * ungated where solutions and hints are not: how to alias kubectl, how to
 * generate a manifest instead of typing one, and where to look when a Pod
 * will not start are the same advice before, during and after an attempt.
 * It is most useful before one, which is where the two entry points are.
 *
 * The body is the BANK's markdown, not a string in this repo's UI copy.
 * What makes a CKAD sitting fast is not what makes a KCNA one fast, so a
 * hardcoded panel here would have to claim one of them was the other —
 * the same reasoning that moved node counts into spec.environment.
 *
 * Fetched when the sheet opens rather than with the exam: it is several
 * kilobytes of prose that most sessions never open, and the caller
 * already knows from `ExamInfo.hasTips` whether the control should exist
 * at all.
 */
export function ExamTips({ onClose }: { onClose: () => void }) {
  const tips = useAsync((signal) => getExamTips(signal), []);

  return (
    <Dialog title={strings.tips.title} onClose={onClose} wide>
      <p className="dialog-lead">{strings.tips.lead}</p>

      <div className="tips-body">
        <Async
          state={tips}
          loading={<p className="page-loading">{strings.app.working}</p>}
          error={(message, reload) => (
            <div className="catalog-error" role="alert">
              <p className="catalog-error-body">{strings.tips.failed(message)}</p>
              <button type="button" className="btn" onClick={reload}>
                {strings.exams.catalogRetry}
              </button>
            </div>
          )}
        >
          {/* Copyable, deliberately: almost every line of this file is a
              command meant to be run on the exam desktop, and the whole
              point of the page is not retyping them under a clock. */}
          {(markdown) => <Markdown>{markdown}</Markdown>}
        </Async>
      </div>

      <div className="confirm-actions">
        <button className="btn btn-primary" onClick={onClose}>
          {strings.tips.done}
        </button>
      </div>
    </Dialog>
  );
}
