import type { ControlJob } from "../api";
import { formatElapsed } from "../lib/format";
import { useTick } from "../lib/useTick";
import { strings } from "../strings";

interface BackgroundJobChipProps {
  job: ControlJob;
  bankTitle?: string;
  onReopen: () => void;
}

// Pressing Escape, or "Run in background", takes the rebuild overlay away.
// The job keeps going: a cluster rebuild is 2-4 minutes of wiping instances,
// recreating a kind cluster and restarting the facilitator. Until this
// existed there was no indicator of that anywhere — no badge, no bar, no
// toast — so the lobby underneath looked completely idle while the thing it
// describes was being torn down and rebuilt.
//
// It lives in App's existing .floating-controls cluster, which is exactly
// right and not a coincidence: a rebuild ends the session, so
// `session.state !== "running"` always holds while one is backgrounded,
// which is the condition that cluster is already mounted under.
export function BackgroundJobChip({ job, bankTitle, onReopen }: BackgroundJobChipProps) {
  const now = useTick(true);

  const total = job.phases.length;
  const done = job.phases.filter((p) => p.state === "done").length;
  const running = job.phases.find((p) => p.state === "running");
  const label = bankTitle
    ? strings.control.switchTitle(bankTitle)
    : job.op === "switch"
      ? strings.control.switchTitle(job.bank)
      : strings.control.resetTitle;

  const startedAt = Date.parse(job.startedAt);
  const elapsed = Number.isNaN(startedAt) ? null : formatElapsed(now - startedAt);

  return (
    <button className="job-chip" onClick={onReopen} aria-label={strings.control.reopen(label)}>
      <span className="job-chip-row">
        {/* Only the phase label is announced. The counter and the clock
            beside it change every second, and a live region that
            re-announces every second buries the thing that actually
            changed. */}
        <span className="job-chip-label" role="status">
          {running?.label ?? label}
        </span>
        <span className="job-chip-count" aria-hidden="true">
          {done}/{total}
        </span>
      </span>
      {/* Determinate by step, not by time. Weighting the bar by duration
          would need persisted per-phase medians (a real follow-up), but
          "3 of 6 phases done" is data already in hand and honest. */}
      <span
        className="job-chip-bar"
        role="progressbar"
        aria-label={strings.control.progressLabel}
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        {/* scaleX rather than width: only transform and opacity are
            animated anywhere in this product, both compositor-only, which
            matters for something on screen for minutes. */}
        <span
          className="job-chip-bar-fill"
          style={{ transform: `scaleX(${total > 0 ? done / total : 0})` }}
        />
      </span>
      {/* The reduce-safe channel: this ticks whether or not the user
          accepts motion, so the chip never degrades to a static badge that
          could equally mean "stuck". */}
      {elapsed && (
        <span className="job-chip-elapsed" aria-hidden="true">
          {elapsed}
        </span>
      )}
    </button>
  );
}
