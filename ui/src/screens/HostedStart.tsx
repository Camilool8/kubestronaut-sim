import { useState } from "react";
import {
  endHostedSession,
  startHostedSession,
  type Me,
  type SessionKind,
  type Seats,
} from "../api";
import { Dialog } from "../components/Dialog";
import { strings } from "../strings";

interface HostedStartProps {
  me: Me;
  /** Re-ask /api/me now, rather than waiting out the poll interval. */
  onChanged: () => void;
}

/** One flavour's card: what it is, what it costs, and the button. */
interface Flavour {
  kind: SessionKind;
  title: string;
  body: string;
  seats: Seats | undefined;
}

/**
 * The hosted lobby: signed in, no session yet.
 *
 * It offers a FLAVOUR, not a bank, and that is not a simplification. In
 * hosted mode the bank each flavour runs is a deployment value — the
 * chart's `sessions.practical.bank` — because the candidate has no
 * environment yet and therefore nothing to ask for a bank list from. The
 * exam selector they know is inside the session, served by their own
 * facilitator, and they reach it the moment their Pod answers.
 */
export function HostedStart({ me, onChanged }: HostedStartProps) {
  const [starting, setStarting] = useState<SessionKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Two separate things, and conflating them was the bug worth avoiding:
  // `queued` is the standing fact — this candidate is in a queue — and
  // `dialog` is whether the interruption announcing it is on screen.
  // Dismissing the dialog must not lose the place, and the place must
  // survive the seconds before /api/me next answers with `queue` in it.
  const [queued, setQueued] = useState<{ position: number } | null>(null);
  const [dialog, setDialog] = useState(false);
  // The server's number wins once it has one: the queue moves while this
  // page sits open, and the 409's position is only true at the moment it
  // was issued.
  const place = me.queue?.position ?? queued?.position ?? 0;

  const leaveQueue = async () => {
    setQueued(null);
    setDialog(false);
    // The hub treats a queued user with no session as a dequeue, so this
    // is the same call that ends a running one. Failures are not raised:
    // the worst case is a place kept in a queue the candidate stopped
    // watching, and the hold expires on its own.
    await endHostedSession().catch(() => undefined);
    onChanged();
  };

  const start = async (kind: SessionKind) => {
    setStarting(kind);
    setError(null);
    try {
      const result = await startHostedSession(kind);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if ("queued" in result) {
        setQueued({ position: result.position });
        setDialog(true);
        onChanged();
        return;
      }
      // 202: a seat is held and a Pod is being built. Nothing more to do
      // here — the identity poll is already watching, and it switches
      // this screen out for the boot screen on its next tick.
      onChanged();
    } catch (err) {
      setError(String(err));
    } finally {
      setStarting(null);
    }
  };

  const offered: Flavour[] = [
    {
      kind: "practical",
      title: strings.hosted.practicalTitle,
      body: strings.hosted.practicalBody,
      seats: me.seats?.practical,
    },
    {
      kind: "mcq",
      title: strings.hosted.mcqTitle,
      body: strings.hosted.mcqBody,
      seats: me.seats?.mcq,
    },
  ];
  // A flavour a deployment gave no seats to is not offered at all. The
  // hub refuses it anyway, and a disabled card explaining an option this
  // deployment does not have would be a worse way to find that out.
  const flavours = offered.filter((f) => f.seats !== undefined);

  return (
    <div className="page hosted-screen">
      <header className="page-head">
        <div>
          <h1>{strings.hosted.startTitle(me.user?.login ?? "")}</h1>
          <p className="page-lead">{strings.hosted.startLead}</p>
        </div>
      </header>

      {error && (
        <p className="progress-notice" role="alert">
          {strings.hosted.startFailed(error)}
        </p>
      )}

      {/* Standing state, not an interruption: it survives the dialog
          being dismissed and updates as the queue moves. */}
      {place > 0 && (
        <div className="hosted-queue" role="status">
          <p className="hosted-queue-place">{strings.hosted.queueBody(place)}</p>
          <p className="hosted-queue-hold">{strings.hosted.queueHold}</p>
          <button type="button" className="btn" onClick={() => void leaveQueue()}>
            {strings.hosted.queueLeave}
          </button>
        </div>
      )}

      <ul className="hosted-flavours">
        {flavours.map((f) => {
          const full = f.seats !== undefined && f.seats.used >= f.seats.total;
          return (
            <li key={f.kind}>
              <article className="hosted-flavour" data-full={full || undefined}>
                <h2>{f.title}</h2>
                <p>{f.body}</p>
                <p className="hosted-flavour-seats">
                  {f.seats === undefined
                    ? null
                    : full
                      ? strings.hosted.seatsFull(f.seats.total)
                      : strings.hosted.seatsFree(f.seats.used, f.seats.total)}
                </p>
                {/* Enabled even when full, deliberately. The answer to a
                    full pool is a place in the queue, and a greyed-out
                    button offers no way to ask for one. */}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void start(f.kind)}
                  disabled={starting !== null}
                >
                  {starting === f.kind ? strings.hosted.starting : strings.hosted.start}
                </button>
              </article>
            </li>
          );
        })}
      </ul>

      {dialog && place > 0 && (
        <Dialog title={strings.hosted.queueTitle} onClose={() => setDialog(false)}>
          <p>{strings.hosted.queueBody(place)}</p>
          <p>{strings.hosted.queueHold}</p>
          <div className="confirm-actions">
            <button type="button" className="btn" onClick={() => void leaveQueue()}>
              {strings.hosted.queueLeave}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setDialog(false)}>
              {strings.hosted.queueWait}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
