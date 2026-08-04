import { useState } from "react";
import { endHostedSession, startHostedSession, type HostedSession } from "../api";
import { PendingBar } from "../components/Pending";
import { formatElapsed } from "../lib/format";
import { useTick } from "../lib/useTick";
import { strings } from "../strings";

interface HostedBootingProps {
  session: HostedSession;
  onChanged: () => void;
}

/**
 * A seat is held and the environment is not up yet.
 *
 * Two waiting states, and they say different things because they mean
 * different things to the person waiting. `pending` is "nothing is wrong,
 * someone else is booting first" — the hub builds Pods one at a time
 * because boot is CPU-bound and two at once makes both slow. `starting`
 * is their own Pod, building a real two-node cluster.
 *
 * The elapsed counter is the signal that works without motion: it ticks
 * identically whether or not the candidate accepts animation, and the bar
 * beneath it is the enhancement. Same rule as the grading screen.
 */
export function HostedBooting({ session, onChanged }: HostedBootingProps) {
  const [busy, setBusy] = useState(false);
  const failed = session.state === "failed";
  const now = useTick(!failed);
  const started = Date.parse(session.startedAt);
  const elapsed = Number.isNaN(started) ? 0 : now - started;

  const retry = async () => {
    setBusy(true);
    // End first, then ask again: a failed session still holds its seat so
    // the candidate can read why, and starting without giving that up
    // would simply hand back the same failed session.
    await endHostedSession().catch(() => undefined);
    await startHostedSession(session.kind).catch(() => undefined);
    setBusy(false);
    onChanged();
  };

  const giveUp = async () => {
    setBusy(true);
    await endHostedSession().catch(() => undefined);
    setBusy(false);
    onChanged();
  };

  if (failed) {
    return (
      <div className="page hosted-screen">
        <h1>{strings.hosted.bootFailedTitle}</h1>
        {session.error && <p className="error-text">{session.error}</p>}
        <div className="score-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void retry()}
            disabled={busy}
          >
            {strings.hosted.bootRetry}
          </button>
          <button type="button" className="btn" onClick={() => void giveUp()} disabled={busy}>
            {strings.hosted.bootGiveUp}
          </button>
        </div>
      </div>
    );
  }

  const pending = session.state === "pending";
  const title = pending ? strings.hosted.bootPendingTitle : strings.hosted.bootStartingTitle;

  return (
    <div className="page hosted-screen hosted-booting">
      <h1>{title}</h1>
      <p>{pending ? strings.hosted.bootPendingBody : strings.hosted.bootStartingBody}</p>
      <div className="score-loading-progress">
        <PendingBar label={title} />
        {/* aria-hidden and tabular, matching the control overlay: a clock
            that re-announces every second buries the line that changed. */}
        <p className="score-loading-elapsed" aria-hidden="true">
          {strings.hosted.bootElapsed(formatElapsed(elapsed))}
        </p>
      </div>
      <button type="button" className="btn" onClick={() => void giveUp()} disabled={busy}>
        {strings.hosted.bootGiveUp}
      </button>
    </div>
  );
}
