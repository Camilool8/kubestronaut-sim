import type { ControlJob } from "../api";
import { strings } from "../strings";

interface ControlProgressProps {
  job: ControlJob;
  onRetry: () => void;
  onDismiss: () => void;
}

// Full-screen overlay tracking a conductor job (reset / bank switch).
// Rendered by App whenever a control job is in flight — or has failed
// and not been dismissed — so it survives every screen transition the
// job itself causes.
export function ControlProgress({ job, onRetry, onDismiss }: ControlProgressProps) {
  const failed = Boolean(job.error);
  const title =
    job.op === "switch"
      ? strings.control.switchTitle(job.bank)
      : strings.control.resetTitle;

  return (
    <div className="control-overlay">
      <div className="control-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{failed ? strings.control.failedTitle : title}</h2>
        {/* polite live region: each phase transition is announced without
            interrupting; the failure case below is an alert */}
        <ul className="control-phases" aria-live="polite">
          {job.phases.map((p) => (
            <li key={p.id} className={`phase-${p.state}`}>
              {p.state === "running" ? (
                <span className="phase-mark phase-mark-spinner" aria-hidden="true" />
              ) : (
                <span className="phase-mark" aria-hidden="true">
                  {p.state === "done" ? "✓" : p.state === "failed" ? "✗" : "·"}
                </span>
              )}
              <span className="phase-label">{p.label}</span>
            </li>
          ))}
        </ul>
        {failed ? (
          <>
            <p className="error-text" role="alert">
              {job.error}
            </p>
            <div className="control-actions">
              <button className="btn" onClick={onDismiss}>
                {strings.control.dismiss}
              </button>
              <button className="btn btn-primary" onClick={onRetry}>
                {strings.control.retry}
              </button>
            </div>
          </>
        ) : (
          <p className="control-hint">{strings.control.hint}</p>
        )}
      </div>
    </div>
  );
}
