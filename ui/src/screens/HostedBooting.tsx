import { useState } from "react";
import { endHostedSession, getHostedExams, startHostedSession, type HostedSession } from "../api";
import { PendingBar } from "../components/Pending";
import { useDesktopGate } from "../components/DesktopRequired";
import { formatElapsed } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { useTick } from "../lib/useTick";
import { strings } from "../strings";

interface HostedBootingProps {
  session: HostedSession;
  onChanged: () => void;
}

export function HostedBooting({ session, onChanged }: HostedBootingProps) {
  const [busy, setBusy] = useState(false);
  const failed = session.state === "failed";

  const blocked = useDesktopGate() === "blocked" && session.kind !== "mcq";
  const now = useTick(!failed);
  const started = Date.parse(session.startedAt);
  const elapsed = Number.isNaN(started) ? 0 : now - started;

  const examsState = useAsync((signal) => getHostedExams(signal), []);
  const exam = examsState.data?.find((e) => e.id === session.bank);

  const rebuilding = session.op === "reset" || session.op === "switch";

  const [wasRebuilding, setWasRebuilding] = useState(false);
  if (rebuilding && !wasRebuilding) setWasRebuilding(true);
  const failedRebuild = failed && wasRebuilding;

  const retry = async () => {
    setBusy(true);

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

        {blocked ? (
          <p className="hosted-boot-blocked">{strings.mobile.lobbyNote}</p>
        ) : null}
        <div className="score-actions">
          {!blocked && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void retry()}
              disabled={busy}
            >
              {strings.hosted.bootRetry}
            </button>
          )}
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

  const body = rebuilding
    ? strings.hosted.rebuildBody(exam?.certification || exam?.title)
    : pending
      ? strings.hosted.bootPendingBody
      : session.kind === "mcq"
        ? strings.hosted.bootStartingBodyMcq
        : strings.hosted.bootStartingBody(
            exam?.nodes,
            exam?.questionCount,
            (exam?.poolCount ?? 0) > (exam?.questionCount ?? 0),
          );

  return (
    <div className="page hosted-screen hosted-booting">
      <h1>{title}</h1>
      <p>{body}</p>

      {!pending && session.kind !== "mcq" && (
        <p className="hosted-boot-reassure" role="status">
          {rebuilding ? strings.hosted.rebuildReassure(elapsed) : strings.hosted.bootReassure(elapsed)}
        </p>
      )}
      <div className="score-loading-progress">
        <PendingBar label={title} />

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
