import { useState } from "react";
import {
  endHostedSession,
  getHostedExams,
  startHostedSession,
  type HostedExam,
  type Me,
  type SessionKind,
  type Seats,
} from "../api";
import { Async } from "../components/Async";
import { CertMark, hasCertMark } from "../components/CertMark";
import { Dialog } from "../components/Dialog";
import { Icon, type IconName } from "../components/Icon";
import { useAsync } from "../lib/useAsync";
import { strings } from "../strings";

interface HostedStartProps {
  me: Me;
  /** Re-ask /api/me now, rather than waiting out the poll interval. */
  onChanged: () => void;
}

/**
 * One startable option: an exam if the deployment staged a bank index,
 * a bare flavour if it did not.
 *
 * `bank` is what makes the difference. With one, the hub is told which
 * certification to build and derives the seat pool from it; without one,
 * the flavour is all there is to ask for and the deployment's configured
 * default exam is what turns up.
 */
interface Choice {
  key: string;
  kind: SessionKind;
  bank?: string;
  title: string;
  subtitle?: string;
  body: string;
  certification?: string;
  seats: Seats | undefined;
  /**
   * The tile glyph, in the exam selector's vocabulary — this lobby is
   * the same product one step earlier, so its cards are that card. A
   * hands-on seat is the one that needs a keyboard (it is what the
   * mobile gate says too); multiple choice is a grid of options.
   */
  icon: IconName;
  /** Set for a certification on the path whose bank is not written. */
  soonNote?: string;
}

/** The two-card fallback: what this screen offered before exams existed. */
function flavourChoices(me: Me): Choice[] {
  return [
    {
      key: "practical",
      kind: "practical",
      title: strings.hosted.practicalTitle,
      body: strings.hosted.practicalBody,
      seats: me.seats?.practical,
      icon: "keyboard",
    },
    {
      key: "mcq",
      kind: "mcq",
      title: strings.hosted.mcqTitle,
      body: strings.hosted.mcqBody,
      seats: me.seats?.mcq,
      icon: "grid",
    },
  ].filter((f) => f.seats !== undefined) as Choice[];
}

/**
 * One card per exam, in the exam selector's own vocabulary.
 *
 * Seats stay per ENGINE and the card says so: what a seat costs the
 * cluster is a session Pod, and every hands-on exam is one, so CKAD and
 * CKA draw from the same pool. A per-exam seat count would be inventing
 * capacity that does not exist.
 */
function examChoices(me: Me, exams: HostedExam[]): Choice[] {
  return exams
    .filter((e) => me.seats?.[e.kind] !== undefined || !e.available)
    .map((e) => ({
      key: e.id,
      kind: e.kind,
      bank: e.available ? e.id : undefined,
      title: e.certification || e.title,
      subtitle: strings.exams.certNames[e.certification ?? ""] ?? e.title,
      body: e.description ?? strings.hosted.examFallbackBody,
      certification: e.certification,
      seats: me.seats?.[e.kind],
      icon: e.kind === "mcq" ? "grid" : "keyboard",
      soonNote: e.available ? undefined : e.note || strings.exams.soon,
    }));
}

/**
 * The hosted lobby: signed in, no session yet.
 *
 * It offers the CERTIFICATION, because that is what somebody came here
 * to sit. It used to offer a flavour — "hands-on" or "multiple choice" —
 * and the exam behind each was a deployment value (`sessions.practical.bank`)
 * that the person sitting it never saw, which was fine only while there
 * was exactly one of each. The hub reads a bank index staged beside it,
 * so the list is the banks themselves rather than a second copy of their
 * names in values.yaml.
 *
 * A seat is then THAT exam: the Pod is stamped and sized for it, and the
 * exam selector inside the session offers no other. Changing exam means
 * ending the session, which is honest — it is a different environment.
 *
 * A deployment with no index staged still works and still offers the two
 * flavour cards, which is what this screen was before.
 */
export function HostedStart({ me, onChanged }: HostedStartProps) {
  const [starting, setStarting] = useState<string | null>(null);
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

  // Fetched once. The exam list is an image layer on the hub's side and
  // cannot change while this screen is open.
  const examsState = useAsync((signal) => getHostedExams(signal), []);

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

  const start = async (choice: Choice) => {
    setStarting(choice.key);
    setError(null);
    try {
      const result = await startHostedSession(choice.kind, choice.bank);
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

      <Async
        state={examsState}
        loading={<p className="page-loading">{strings.app.working}</p>}
        // A hub whose exam list will not load still has seats. Falling
        // back is better than a dead lobby, and the deployment default is
        // the exam it would have started anyway.
        error={() => <ChoiceList choices={flavourChoices(me)} starting={starting} onStart={start} />}
      >
        {(exams) => (
          <ChoiceList
            choices={exams.length > 0 ? examChoices(me, exams) : flavourChoices(me)}
            starting={starting}
            onStart={start}
          />
        )}
      </Async>

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

function ChoiceList({
  choices,
  starting,
  onStart,
}: {
  choices: Choice[];
  starting: string | null;
  onStart: (choice: Choice) => void | Promise<void>;
}) {
  if (choices.length === 0) {
    return <p className="page-empty">{strings.hosted.noExams}</p>;
  }
  return (
    <ul className="hosted-flavours">
      {choices.map((c) => {
        const full = c.seats !== undefined && c.seats.used >= c.seats.total;
        return (
          <li key={c.key}>
            <article className="hosted-flavour" data-full={(full && !c.soonNote) || undefined}>
              <div className="hosted-flavour-head">
                <span className="exam-avatar hosted-flavour-tile" aria-hidden="true">
                  {/* An exam card wears its certification's own mark, the
                      same one the local selector draws. A flavour card
                      has no certification and keeps the engine glyph. */}
                  {c.certification && hasCertMark(c.certification) ? (
                    <CertMark certification={c.certification} />
                  ) : (
                    <Icon name={c.icon} />
                  )}
                </span>
                <div className="hosted-flavour-name">
                  <h2>{c.title}</h2>
                  <p className="hosted-flavour-seats">
                    {c.soonNote
                      ? c.subtitle
                      : c.seats === undefined
                        ? null
                        : full
                          ? strings.hosted.seatsFull(c.seats.total)
                          : strings.hosted.seatsFree(c.seats.used, c.seats.total)}
                  </p>
                </div>
              </div>
              <p className="hosted-flavour-body">{c.soonNote ?? c.body}</p>
              {/* Enabled even when full, deliberately, and it says what
                  it will actually do. The answer to a full pool is a
                  place in the queue: a greyed-out button offers no way
                  to ask for one, and one labelled "Start" promises a
                  session that is not what the click produces.

                  A certification with no bank behind it has no button at
                  all — there is nothing to press it for, and the note
                  above says why. */}
              {!c.soonNote && (
                <div className="hosted-flavour-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void onStart(c)}
                    disabled={starting !== null}
                  >
                    {starting === c.key
                      ? strings.hosted.starting
                      : full
                        ? strings.hosted.startQueue
                        : strings.hosted.start}
                  </button>
                </div>
              )}
            </article>
          </li>
        );
      })}
    </ul>
  );
}
