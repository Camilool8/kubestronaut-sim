import { useEffect, useState } from "react";
import {
  getExam,
  getSession,
  startSession,
  type ExamInfo,
  type ExamMode,
  type SessionMode,
  type SessionSnapshot,
} from "../api";
import { Async } from "../components/Async";
import { useDesktopGate } from "../components/DesktopRequired";
import { ExamIntro, markIntroSeen } from "../components/ExamIntro";
import { Icon } from "../components/Icon";
import { formatDuration } from "../lib/format";
import { navigate } from "../lib/useHashRoute";
import { useAsync } from "../lib/useAsync";
import { strings } from "../strings";

// Fallback for a facilitator that predates the modes field, so the cards
// still render rather than collapsing to nothing. Ordered as the server
// orders them: gentlest first, the real thing last.
const DEFAULT_MODES: ExamMode[] = [
  {
    id: "training",
    durationSeconds: 0,
    untimed: true,
    helpAllowed: true,
    gradesPerTask: true,
    recorded: false,
    recommended: false,
  },
  {
    id: "speed",
    durationSeconds: 3600,
    untimed: false,
    helpAllowed: false,
    gradesPerTask: false,
    recorded: true,
    recommended: true,
  },
  {
    id: "exam",
    durationSeconds: 7200,
    untimed: false,
    helpAllowed: false,
    gradesPerTask: false,
    recorded: true,
    recommended: false,
  },
];

/**
 * One server-enforced permission, as a row.
 *
 * The glyph is decoration — a tick and a cross are the same shape to a
 * screen reader, and colour alone would carry the state to nobody using
 * one. The sr-only word beside it is what actually says yes or no.
 */
function Capability({ on, label }: { on: boolean; label: string }) {
  return (
    <li className={on ? "mode-cap mode-cap-on" : "mode-cap"}>
      <Icon name={on ? "check" : "cross"} />
      <span className="sr-only">{on ? strings.mode.capYes : strings.mode.capNo}</span>
      {label}
    </li>
  );
}

interface ModeCardProps {
  mode: ExamMode;
  /** The real exam's clock, for showing a shortened one as shortened. */
  fullSeconds: number;
  starting: boolean;
  disabled: boolean;
  onStart: () => void;
}

function ModeCard({ mode, fullSeconds, starting, disabled, onStart }: ModeCardProps) {
  const copy = strings.modes[mode.id];
  const minutes = Math.round(mode.durationSeconds / 60);
  const shortened = !mode.untimed && fullSeconds > 0 && mode.durationSeconds < fullSeconds;

  return (
    <li>
      <article className={mode.recommended ? "mode-card mode-card-on" : "mode-card"}>
        <div className="mode-card-body">
          <div className="mode-card-head">
            <h2>{copy.label}</h2>
            <span className="mode-badge">{copy.badge}</span>
          </div>

          <p className="mode-clock">
            {mode.untimed ? strings.mode.untimed : formatDuration(mode.durationSeconds)}
            {/* Half a clock only reads as half if the whole is beside it. */}
            {shortened && (
              <span className="mode-clock-full">
                {strings.mode.fullClock(formatDuration(fullSeconds))}
              </span>
            )}
          </p>

          <p className="mode-blurb">{copy.blurb(minutes)}</p>

          {/* Generated from the flags the facilitator enforces, never
              restated here — a card cannot advertise something the
              server then refuses. */}
          <ul className="mode-caps" aria-label={strings.mode.capListLabel}>
            <Capability on={mode.helpAllowed} label={strings.mode.capHelp} />
            <Capability on={mode.gradesPerTask} label={strings.mode.capGrade} />
            <Capability on={mode.recorded} label={strings.mode.capRecorded} />
          </ul>

          {/* Said in words as well as drawn in accent: an accented border
              and a filled button are one channel, and one channel is
              none for a reader who cannot see it. */}
          {mode.recommended && <p className="mode-recommended">{strings.mode.recommended}</p>}
        </div>

        <button
          type="button"
          className={mode.recommended ? "btn btn-primary mode-start" : "btn mode-start"}
          onClick={onStart}
          disabled={disabled || starting}
        >
          {starting ? strings.mode.starting : strings.mode.start(copy.label)}
        </button>
      </article>
    </li>
  );
}

/**
 * What this exam will ask. The domain list is a summary, not a filter:
 * the draw is not yet configurable, so nothing here is drawn as a
 * control that would do nothing.
 */
function DrawPanel({ exam }: { exam: ExamInfo }) {
  const pool = exam.questions.length;
  const drawn = exam.questionCount || pool;
  const pooled = pool > drawn;

  const counts = new Map<string, number>();
  for (const q of exam.questions) {
    const domain = q.domain || strings.score.domainUnknown;
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  const domains = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <section className="draw-panel">
      <div className="draw-panel-lead">
        <h2>{strings.mode.drawTitle}</h2>
        <p>{pooled ? strings.mode.drawPooled(drawn, pool) : strings.mode.drawAll(drawn)}</p>
      </div>
      {domains.length > 0 && (
        <div className="draw-panel-domains">
          <h3>{pooled ? strings.mode.domainsPool : strings.mode.domainsExam}</h3>
          <ul>
            {domains.map(([name, n]) => (
              <li key={name}>
                {name}
                <span className="domain-count">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

interface ModeProps {
  /** The bank id in the route, which need not be the loaded one. */
  bankId: string;
  catalogVersion: number;
  onSessionChange: (session: SessionSnapshot) => void;
}

/**
 * The mode selector: the last screen before the clock starts.
 *
 * Everything the three cards promise comes from the flags on
 * GET /api/exam's modes, which the facilitator derives from the same
 * predicates its handlers enforce with. A 409 from POST
 * /api/session/start (a concurrent start, or the poller having just seen
 * the exam begin) is answered by refetching the authoritative session
 * state rather than showing an error — App then routes to whatever that
 * state implies.
 */
export function Mode({ bankId, catalogVersion, onSessionChange }: ModeProps) {
  const [starting, setStarting] = useState<SessionMode | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState(false);

  const examState = useAsync((signal) => getExam(signal), [catalogVersion]);
  const exam = examState.data;
  const isMcq = exam?.examType === "mcq";

  // A phone can browse the catalog; it cannot run a hands-on exam. An
  // mcq exam it CAN run — the gate is about the terminal-and-desktop
  // split screen, which mcq does not have.
  const blocked = useDesktopGate() === "blocked" && !isMcq;

  // The route named an exam that is not the loaded one: a stale
  // bookmark, or a switch that failed after this screen was queued.
  // Every card here would start the OTHER exam, so the only honest move
  // is to go back. `replace` so Back does not bounce straight in again.
  const wrongExam = exam !== null && exam.name !== bankId;
  useEffect(() => {
    if (wrongExam) navigate("/exams", { replace: true });
  }, [wrongExam]);

  const handleStart = async (mode: Exclude<SessionMode, "">) => {
    setStarting(mode);
    setStartError(null);
    try {
      const result = await startSession(mode);
      if (result.ok) {
        onSessionChange(result.session);
      } else {
        onSessionChange(await getSession());
      }
    } catch (err) {
      setStartError(String(err));
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="page mode-screen">
      <header className="page-head page-head-stacked">
        <h1>{strings.mode.title}</h1>
        <p className="page-lead">{strings.mode.lead}</p>
      </header>

      <Async
        state={examState}
        loading={<p className="page-loading">{strings.app.working}</p>}
        error={(message, reload) => (
          <div className="catalog-error" role="alert">
            <p className="catalog-error-body">{strings.mode.examFailed(message)}</p>
            <button type="button" className="btn" onClick={reload}>
              {strings.exams.catalogRetry}
            </button>
          </div>
        )}
      >
        {(loaded) => {
          if (loaded.name !== bankId) {
            // The effect above is already navigating away; say why
            // rather than flashing a screen for the wrong exam.
            return <p className="page-loading">{strings.mode.wrongExam}</p>;
          }
          const modes = loaded.modes?.length ? loaded.modes : DEFAULT_MODES;
          const fullSeconds =
            modes.find((m) => m.id === "exam")?.durationSeconds ?? loaded.durationSeconds;

          return (
            <>
              <ul className="mode-grid">
                {modes.map((m) => (
                  <ModeCard
                    key={m.id}
                    mode={m}
                    fullSeconds={fullSeconds}
                    starting={starting === m.id}
                    disabled={blocked || (starting !== null && starting !== m.id)}
                    onStart={() => handleStart(m.id)}
                  />
                ))}
              </ul>

              {startError && <p className="error-text">{startError}</p>}
              {/* Say why rather than leaving three dead buttons: the
                  catalog is worth browsing on a phone, sitting an exam
                  is not. */}
              {blocked && <p className="mode-blocked">{strings.mobile.startDisabled}</p>}

              <DrawPanel exam={loaded} />

              <div className="mode-fine">
                <ul className="page-tips">
                  {(isMcq ? strings.mode.tipsMcq : strings.mode.tips).map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                  <li>{strings.mode.tipTimer}</li>
                </ul>
                {/* Marks the card seen: someone who reads it here should
                    not have it thrown at them again the moment the exam
                    opens. Hidden for mcq — the card walks through the
                    split-screen desktop layout, none of which exists
                    there. */}
                {!isMcq && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      markIntroSeen();
                      setIntroOpen(true);
                    }}
                  >
                    {strings.intro.open}
                  </button>
                )}
              </div>
            </>
          );
        }}
      </Async>

      {introOpen && <ExamIntro onClose={() => setIntroOpen(false)} />}
    </div>
  );
}
