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
import { useDesktopGate } from "../components/DesktopRequired";
import { useAsync } from "../lib/useAsync";
import { strings } from "../strings";

interface HostedStartProps {
  me: Me;

  onChanged: () => void;
}

interface Choice {
  key: string;
  kind: SessionKind;
  bank?: string;
  title: string;
  subtitle?: string;
  body: string;
  certification?: string;
  seats: Seats | undefined;

  icon: IconName;

  soonNote?: string;

  deviceNote?: string;
}

function deviceNote(kind: SessionKind, blocked: boolean): string | undefined {
  return blocked && kind === "practical" ? strings.mobile.lobbyNote : undefined;
}

function flavourChoices(me: Me, blocked: boolean): Choice[] {
  return [
    {
      key: "practical",
      kind: "practical",
      title: strings.hosted.practicalTitle,
      body: strings.hosted.practicalBody,
      seats: me.seats?.practical,
      icon: "keyboard",
      deviceNote: deviceNote("practical", blocked),
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

function examChoices(me: Me, exams: HostedExam[], blocked: boolean): Choice[] {
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

      deviceNote: e.available ? deviceNote(e.kind, blocked) : undefined,
    }));
}

export function HostedStart({ me, onChanged }: HostedStartProps) {
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [queued, setQueued] = useState<{ position: number } | null>(null);
  const [dialog, setDialog] = useState(false);

  const place = me.queue?.position ?? queued?.position ?? 0;

  const examsState = useAsync((signal) => getHostedExams(signal), []);

  const blocked = useDesktopGate() === "blocked";

  const leaveQueue = async () => {
    setQueued(null);
    setDialog(false);

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

        error={() => (
          <ChoiceList choices={flavourChoices(me, blocked)} starting={starting} onStart={start} />
        )}
      >
        {(exams) => (
          <ChoiceList
            choices={
              exams.length > 0 ? examChoices(me, exams, blocked) : flavourChoices(me, blocked)
            }
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

        const note = c.soonNote ?? c.deviceNote;
        return (
          <li key={c.key}>
            <article className="hosted-flavour" data-full={(full && !note) || undefined}>
              <div className="hosted-flavour-head">
                <span className="exam-avatar hosted-flavour-tile" aria-hidden="true">

                  {c.certification && hasCertMark(c.certification) ? (
                    <CertMark certification={c.certification} />
                  ) : (
                    <Icon name={c.icon} />
                  )}
                </span>
                <div className="hosted-flavour-name">
                  <h2>{c.title}</h2>

                  <p className="hosted-flavour-seats">
                    {c.deviceNote && !c.soonNote ? (
                      <span className="hosted-flavour-badge">{strings.mobile.needsDesktop}</span>
                    ) : note ? (
                      c.subtitle
                    ) : c.seats === undefined ? null : full ? (
                      strings.hosted.seatsFull(c.seats.total)
                    ) : (
                      strings.hosted.seatsFree(c.seats.used, c.seats.total)
                    )}
                  </p>
                </div>
              </div>
              <p className="hosted-flavour-body">{note ?? c.body}</p>

              {!note && (
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
