import type { ControlJob } from "../api";
import { controlJobTitle } from "../lib/controlJob";
import { formatElapsed } from "../lib/format";
import { useTick } from "../lib/useTick";
import { strings } from "../strings";

interface BackgroundJobChipProps {
  job: ControlJob;
  bankTitle?: string;
  onReopen: () => void;
}

export function BackgroundJobChip({ job, bankTitle, onReopen }: BackgroundJobChipProps) {
  const now = useTick(true);

  const total = job.phases.length;
  const done = job.phases.filter((p) => p.state === "done").length;
  const running = job.phases.find((p) => p.state === "running");
  const label = controlJobTitle(job, bankTitle);

  const startedAt = Date.parse(job.startedAt);
  const elapsed = Number.isNaN(startedAt) ? null : formatElapsed(now - startedAt);

  return (
    <button className="job-chip" onClick={onReopen} aria-label={strings.control.reopen(label)}>
      <span className="job-chip-row">

        <span className="job-chip-label" role="status">
          {running?.label ?? label}
        </span>
        <span className="job-chip-count" aria-hidden="true">
          {done}/{total}
        </span>
      </span>

      <span
        className="job-chip-bar"
        role="progressbar"
        aria-label={strings.control.progressLabel}
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
      >

        <span
          className="job-chip-bar-fill"
          style={{ transform: `scaleX(${total > 0 ? done / total : 0})` }}
        />
      </span>

      {elapsed && (
        <span className="job-chip-elapsed" aria-hidden="true">
          {elapsed}
        </span>
      )}
    </button>
  );
}
