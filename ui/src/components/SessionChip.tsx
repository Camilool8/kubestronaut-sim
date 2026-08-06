import { useState } from "react";
import { endHostedSession, logout, type HostedSession } from "../api";
import { Dialog } from "./Dialog";
import { formatClock } from "../lib/format";
import { useTick } from "../lib/useTick";
import { strings } from "../strings";

const SOON_SECONDS = 15 * 60;

export function SessionChip({
  login,
  session,
}: {
  login: string;
  session?: HostedSession;
}) {
  const expires = session ? Date.parse(session.expiresAt) : NaN;
  const live = session !== undefined && !Number.isNaN(expires);
  const now = useTick(live);
  const secondsLeft = live ? Math.max(0, Math.round((expires - now) / 1000)) : 0;
  const soon = live && secondsLeft <= SOON_SECONDS;

  return (
    <div className="session-chip">
      {login && <span className="session-chip-user">{login}</span>}
      {live && (
        <span
          className="session-chip-clock"
          data-soon={soon || undefined}

          role={soon ? "status" : undefined}
        >
          {secondsLeft === 0
            ? strings.hosted.chipExpired
            : soon
              ? strings.hosted.chipEndingSoon(formatClock(secondsLeft))
              : strings.hosted.chipTimeLeft(formatClock(secondsLeft))}
        </span>
      )}
    </div>
  );
}

export async function signOut() {
  await logout().catch(() => undefined);
  window.location.assign("/");
}

export function SessionActions({
  session,
  onEnd,
}: {
  session?: HostedSession;
  onEnd: () => void;
}) {
  return (
    <>
      {session && (
        <button type="button" className="btn btn-quiet" onClick={onEnd}>
          {strings.hosted.endSession}
        </button>
      )}
      <button type="button" className="btn btn-quiet" onClick={() => void signOut()}>
        {strings.hosted.signOut}
      </button>
    </>
  );
}

export function EndSessionDialog({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const end = async () => {
    setBusy(true);
    setError(null);
    const result = await endHostedSession();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
    onChanged();
  };

  return (
    <Dialog title={strings.hosted.endConfirmTitle} onClose={onClose}>
      <p>{strings.hosted.endConfirmBody}</p>
      {error && <p className="error-text">{strings.hosted.endFailed(error)}</p>}
      <div className="confirm-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          {strings.hosted.endCancel}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => void end()}
          disabled={busy}
        >
          {strings.hosted.endConfirm}
        </button>
      </div>
    </Dialog>
  );
}
