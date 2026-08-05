import { useState } from "react";
import { endHostedSession, logout, type HostedSession } from "../api";
import { Dialog } from "./Dialog";
import { formatClock } from "../lib/format";
import { useTick } from "../lib/useTick";
import { strings } from "../strings";

/** Under this much lease left, the countdown starts insisting. */
const SOON_SECONDS = 15 * 60;

/**
 * Who you are and how long you have.
 *
 * The countdown is the part that earns its place: a hosted session has a
 * hard cap and is taken back at it whatever the candidate is doing, so
 * the one thing they cannot be left to guess is how long that is. It is
 * recomputed from the server's `expiresAt` on every tick rather than
 * decremented, so a throttled background tab resyncs instead of drifting.
 *
 * Presentational, and deliberately so. The controls that used to sit
 * beside it are SessionActions below, and the confirmation they raise is
 * owned by the header — because on a narrow viewport those controls live
 * inside a popover that unmounts when it closes, and a dialog rendered
 * underneath them would be destroyed by the click that opened it.
 */
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
      <span className="session-chip-user">{login}</span>
      {live && (
        <span
          className="session-chip-clock"
          data-soon={soon || undefined}
          // Announced only when it starts mattering. A clock in a live
          // region that re-reads every second is unusable with a screen
          // reader on, and for most of a ten-hour lease it is not news.
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

// A full reload rather than a state update. Signing out invalidates a
// cookie that every open fetch and the desktop's WebSocket are carrying,
// and there is no partial version of that.
async function signOut() {
  await logout().catch(() => undefined);
  window.location.assign("/");
}

/**
 * The two ways out.
 *
 * `onEnd` raises the confirmation rather than performing anything: see
 * SessionChip above for why the dialog cannot live here.
 */
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

/** The confirmation, and the call it makes if confirmed. */
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
