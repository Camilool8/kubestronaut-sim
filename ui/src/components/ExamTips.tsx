import { getExamTips } from "../api";
import { useAsync } from "../lib/useAsync";
import { Async } from "./Async";
import { Dialog } from "./Dialog";
import { Markdown } from "./Markdown";
import { strings } from "../strings";

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
