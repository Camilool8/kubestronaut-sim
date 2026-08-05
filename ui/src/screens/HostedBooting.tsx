import { useState } from "react";
import { endHostedSession, getHostedExams, startHostedSession, type HostedSession } from "../api";
import { PendingBar } from "../components/Pending";
import { formatElapsed } from "../lib/format";
import { useAsync } from "../lib/useAsync";
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
 * is their own Pod, building the cluster their chosen exam asked for.
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

  // What is actually being built. The session names its exam; the exam
  // list is what knows that exam's shape. Fetched rather than assumed,
  // because the alternative is asserting one bank's node and task counts
  // at whoever is waiting — which is what this screen used to do.
  //
  // A failure here costs nothing: the copy below falls back to sentences
  // that claim no numbers at all.
  const examsState = useAsync((signal) => getHostedExams(signal), []);
  const exam = examsState.data?.find((e) => e.id === session.bank);

  // The hub says what it is doing to this Pod. Without it "not ready" is
  // the only signal, and a first boot and a rebuild are indistinguishable
  // — which is how the candidate who pressed "New attempt" ended up on a
  // screen written to greet them.
  const rebuilding = session.op === "reset" || session.op === "switch";

  // op clears the instant the job finishes, which happens just before a
  // failed recycle's state flips to "failed" (session.go's runRecycle
  // sets State before calling jobs.finish) — so by the time this screen
  // can render the failure, the hub has already forgotten it was a
  // rebuild. This component stays mounted for the whole of one boot
  // (HostedHome keys its screen transition on "lobby", not on session
  // state), so remembering the last true read across renders survives to
  // explain the failure that follows it — "adjusting state during
  // rendering", which is what React itself calls this pattern, rather
  // than a ref: a ref may not be read or written during render. A page
  // reload mid-failure loses the memory and falls back to the first-boot
  // copy, the same gap every other in-memory read in this app has.
  const [wasRebuilding, setWasRebuilding] = useState(false);
  if (rebuilding && !wasRebuilding) setWasRebuilding(true);
  const failedRebuild = failed && wasRebuilding;

  const retry = async () => {
    setBusy(true);
    // End first, then ask again: a failed session still holds its seat so
    // the candidate can read why, and starting without giving that up
    // would simply hand back the same failed session.
    //
    // Retried onto the SAME exam. Without the bank this fell back to the
    // deployment's default, so a candidate whose CKA environment failed
    // would press "Try again" and be handed CKAD.
    await endHostedSession().catch(() => undefined);
    await startHostedSession(session.kind, session.bank).catch(() => undefined);
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
        <h1>{failedRebuild ? strings.hosted.rebuildFailedTitle : strings.hosted.bootFailedTitle}</h1>
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
            {failedRebuild ? strings.hosted.rebuildGiveUp : strings.hosted.bootGiveUp}
          </button>
        </div>
      </div>
    );
  }

  const pending = session.state === "pending";
  const title = rebuilding
    ? strings.hosted.rebuildTitle
    : pending
      ? strings.hosted.bootPendingTitle
      : strings.hosted.bootStartingTitle;
  // The queue reads the same whatever is being queued for; the build does
  // not. A multiple-choice seat has no cluster to build and is up in
  // seconds, so the hands-on copy would be describing someone else's wait.
  //
  // A rebuild outranks both: it is the same work as a first build, but
  // the sentence a candidate needs is what is happening to the attempt
  // they just finished, not what a new environment contains.
  const body = rebuilding
    ? strings.hosted.rebuildBody(exam?.certification || exam?.title)
    : pending
      ? strings.hosted.bootPendingBody
      : session.kind === "mcq"
        ? strings.hosted.bootStartingBodyMcq
        : strings.hosted.bootStartingBody(exam?.nodes, exam?.questionCount);

  return (
    <div className="page hosted-screen hosted-booting">
      <h1>{title}</h1>
      <p>{body}</p>
      {/* Keyed on the elapsed counter rather than a range promised up
          front: a wait that has already blown through the number it was
          given reads as a hang, and the honest thing to say at four
          minutes is not the thing to say at ten. Only for the build —
          a queue's wait is somebody else's boot and this screen cannot
          narrate it. */}
      {!pending && session.kind !== "mcq" && (
        <p className="hosted-boot-reassure" role="status">
          {rebuilding ? strings.hosted.rebuildReassure(elapsed) : strings.hosted.bootReassure(elapsed)}
        </p>
      )}
      <div className="score-loading-progress">
        <PendingBar label={title} />
        {/* aria-hidden and tabular, matching the control overlay: a clock
            that re-announces every second buries the line that changed. */}
        <p className="score-loading-elapsed" aria-hidden="true">
          {strings.hosted.bootElapsed(formatElapsed(elapsed))}
        </p>
      </div>
      <button type="button" className="btn" onClick={() => void giveUp()} disabled={busy}>
        {rebuilding ? strings.hosted.rebuildGiveUp : strings.hosted.bootGiveUp}
      </button>
    </div>
  );
}
