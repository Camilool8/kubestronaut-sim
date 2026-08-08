import { useId } from "react";
import type { PreparingAttempt } from "../api";
import { PendingBar } from "../components/Pending";
import { formatElapsed } from "../lib/format";
import { useTick } from "../lib/useTick";
import { strings } from "../strings";

interface PreparingProps {
  preparing: PreparingAttempt;

  /**
   * The seed job's running-phase detail, e.g. "question 5 of 17". Arrives from
   * the control poll a moment after the screen does, and is absent until then.
   */
  detail?: string;
}

/**
 * Shown from the moment `POST /api/session/start` answers 202 until the seed
 * job finishes and the attempt begins.
 *
 * It rides `session.preparing`, which App polls every second, rather than the
 * control-status poll that drives ControlProgress: the control poll sits on a
 * 15s idle interval, and waiting for it left the candidate looking at an
 * unchanged mode screen with the buttons re-enabled. The per-task detail still
 * arrives as `detail` once that poll catches up; this screen only has to
 * prove, immediately, that the click did something.
 *
 * This screen owns the whole of the preparing state, so ControlProgress skips
 * seed jobs. A modal over a screen with nothing else on it, offering to run in
 * the background when there is no foreground to return to, was two views of
 * one wait.
 */
export function Preparing({ preparing, detail }: PreparingProps) {
  const titleId = useId();
  const now = useTick(true);

  const started = Date.parse(preparing.startedAt);
  const elapsed = Number.isNaN(started) ? null : formatElapsed(now - started);

  return (
    <div className="boot-screen">
      <div className="boot-panel" role="group" aria-labelledby={titleId}>
        <h1 id={titleId}>{strings.control.seedTitle}</h1>

        <p className="control-status" role="status" aria-live="polite" aria-atomic="true">
          {strings.preparing.body(preparing.questionCount)}
          {detail && <span className="phase-detail">{detail}</span>}
        </p>

        <PendingBar />

        <p className="control-hint">
          {strings.control.hintSeed}
          {elapsed && (
            <span className="control-elapsed" aria-hidden="true">
              {strings.preparing.elapsed(elapsed)}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
