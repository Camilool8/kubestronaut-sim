import { useEffect, useMemo, useState } from "react";
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
import { ExamTips } from "../components/ExamTips";
import { Icon } from "../components/Icon";
import { parseDomainsParam } from "../lib/attemptHistory";
import { formatDuration } from "../lib/format";
import { navigate, useRoute } from "../lib/useHashRoute";
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
  /**
   * The draw has been narrowed, so this button starts a drill rather than
   * a sitting. It changes the verb because the chips that did the
   * narrowing are further down the page than the button is, and the fact
   * has to travel to the point of the act.
   */
  filtered: boolean;
  onStart: () => void;
}

function ModeCard({ mode, fullSeconds, starting, disabled, filtered, onStart }: ModeCardProps) {
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
          {starting
            ? strings.mode.starting
            : filtered
              ? strings.mode.startFiltered(copy.label)
              : strings.mode.start(copy.label)}
        </button>
      </article>
    </li>
  );
}

/**
 * The read-only summary, for a bank that publishes no `domains`.
 *
 * Counted off `exam.questions`, which is the ONE thing the doc comment on
 * `ExamInfo.domains` says not to do — and it is right: once an attempt has
 * drawn its subset, `questions` is that subset, so these counts describe
 * the last draw rather than the curriculum. That is tolerable for tags
 * nobody can act on and would not be tolerable for chips that configure
 * the next draw, which is exactly why this branch renders tags. A bank
 * this old cannot be filtered honestly, so it is not offered.
 */
function DrawTags({ exam, pooled }: { exam: ExamInfo; pooled: boolean }) {
  const counts = new Map<string, number>();
  for (const q of exam.questions) {
    const domain = q.domain || strings.score.domainUnknown;
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  const domains = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (domains.length === 0) return null;

  return (
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
  );
}

interface DrawPanelProps {
  exam: ExamInfo;
  /** Empty means the whole curriculum, which is what the server means too. */
  selected: string[];
  onSelect: (domains: string[]) => void;
}

/**
 * What this exam will ask, and which parts of it to ask about.
 *
 * The domain list is a real control now: POST /api/session/start accepts
 * `{ mode, domains }` and the facilitator has honoured it since the
 * seeded-draw phase. The chips are built from `ExamInfo.domains` — the
 * bank's declared curriculum — and never from counting `exam.questions`,
 * which is the drawn subset once an attempt exists.
 *
 * There is deliberately no length control beside them. `exam.DrawOptions`
 * has a `Length` server-side, but it is mcq-only today and `StartOptions`
 * carries no such field, so a control for it would be one the server
 * ignores.
 */
function DrawPanel({ exam, selected, onSelect }: DrawPanelProps) {
  const domains = exam.domains ?? [];
  const chosen = new Set(selected);

  // The pool is every authored question, which is what `questions` is
  // before an attempt has drawn. Deliberately NOT the sum of the declared
  // domains: the server builds those counts by bucketing questions into
  // spec.domainWeights, so a question whose domain is not declared there
  // is counted in no bucket at all, and a pool figure derived that way
  // would silently under-report the bank. The filtered figure below is a
  // sum over domains because there it is exactly right — a domain the
  // curriculum does not name is a domain no chip can select.
  const pool = exam.questions.length;
  const declared = exam.questionCount || pool;
  const pooled = pool > declared;

  // How many questions the narrowed draw will actually contain. Mirrors
  // exam.Draw: the filter decides what is in scope, and the bank's
  // declared length only bites when it is SMALLER than that — which is
  // why a filtered draw off a pooled bank is usually the whole of the
  // domains picked rather than a sample of them.
  //
  // Without this the panel kept saying "All 22, every attempt" beside a
  // chip row that had just narrowed the draw to four, which is the one
  // claim on this screen a candidate would carry into the exam.
  const inScope = selected.length
    ? domains
        .filter((d) => chosen.has(d.name))
        .reduce((sum, d) => sum + d.questionCount, 0)
    : pool;
  const drawn = Math.min(declared, inScope);

  const toggle = (name: string) => {
    onSelect(chosen.has(name) ? selected.filter((d) => d !== name) : [...selected, name]);
  };

  return (
    <section className="draw-panel">
      <div className="draw-panel-lead">
        <h2>{strings.mode.drawTitle}</h2>
        <p>
          {selected.length > 0
            ? strings.mode.drawNarrowed(drawn, pool, selected.length)
            : pooled
              ? strings.mode.drawPooled(drawn, pool)
              : strings.mode.drawAll(drawn)}
        </p>
      </div>

      {domains.length === 0 ? (
        <DrawTags exam={exam} pooled={pooled} />
      ) : (
        <div className="draw-panel-domains">
          <h3>{strings.mode.chipsTitle}</h3>
          {/* A group of buttons, not a list of them. `.draw-panel-domains
              li` is the read-only tag's own rule — a pill with a fill of
              its own — so wrapping these chips in list items would draw a
              pill inside a pill. A row of toggles is a group either way. */}
          <div className="draw-chips" role="group" aria-label={strings.mode.chipsLabel}>
            {/* The default, drawn as a chip rather than as the absence of
                one: "no filter" is a choice the candidate can make ON
                PURPOSE after making the other one, and it needs somewhere
                to click. Pressed exactly when nothing else is. */}
            <button
              type="button"
              className="draw-chip"
              aria-pressed={selected.length === 0}
              onClick={() => onSelect([])}
            >
              <Icon name="check" className="draw-chip-mark" />
              {strings.mode.allDomains}
            </button>
            {domains.map((d) => (
              <button
                key={d.name}
                type="button"
                className="draw-chip"
                aria-pressed={chosen.has(d.name)}
                onClick={() => toggle(d.name)}
              >
                {/* The tick is the third channel behind aria-pressed and
                    the accent fill, and it is drawn on every chip rather
                    than only the pressed ones: revealing it would move the
                    label out from under the pointer mid-click. Hidden by
                    construction (Icon), so it never speaks over the
                    pressed state. */}
                <Icon name="check" className="draw-chip-mark" />
                {d.name}
                <span className="domain-count">{d.questionCount}</span>
              </button>
            ))}
          </div>
          {/* Said before the attempt, not after the result. The server will
              mark this record `counted: false` and the results banner will
              refuse to call it a pass; a candidate should know both of
              those while they can still change their mind. */}
          {selected.length > 0 && (
            <p className="draw-note">
              {strings.mode.filteredNote(selected.length, domains.length)}
            </p>
          )}
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
 *
 * The screen configures two things now, not one: which clock, and which
 * curriculum domains the questions are drawn from. The second is optional
 * and its absence is the honest default — an unfiltered start posts the
 * bare mode, exactly as every other caller does.
 */
export function Mode({ bankId, catalogVersion, onSessionChange }: ModeProps) {
  const [starting, setStarting] = useState<SessionMode | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);

  const examState = useAsync((signal) => getExam(signal), [catalogVersion]);
  const exam = examState.data;
  const isMcq = exam?.examType === "mcq";

  // "Build a drill from these" on the dashboard lands here with the weak
  // domains in the fragment. It rides the URL rather than a module store
  // so a reload keeps it and the link can be shared — and it is a
  // PRESELECTION, not state: the moment the candidate touches a chip,
  // `picked` takes over and the route stops being consulted.
  //
  // Memoised on the query's STRING form, not on the parsed object:
  // `useRoute()` re-parses the fragment on every render, so the
  // URLSearchParams it hands back is a fresh identity each time and a memo
  // keyed on it would recompute always — and `presetDomains` is itself a
  // dependency further down.
  const query = useRoute().query;
  const queryKey = query.toString();
  const presetDomains = useMemo(
    () => parseDomainsParam(new URLSearchParams(queryKey)),
    [queryKey],
  );
  const [picked, setPicked] = useState<string[] | null>(null);

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

  const handleStart = async (mode: Exclude<SessionMode, "">, domains: string[]) => {
    setStarting(mode);
    setStartError(null);
    try {
      // The bare-mode form for a full-curriculum draw, deliberately: it is
      // the honest call when there is nothing to configure, and it keeps
      // an unfiltered start byte-identical to what every other caller
      // sends.
      const result = await startSession(domains.length > 0 ? { mode, domains } : mode);
      // Three outcomes, and two of them are answered the same way. A 202
      // means the attempt was drawn but its cluster is still being
      // prepared, so there is no session to route on yet; a 409 means the
      // server's idea of the session is not ours. Both are settled by
      // asking the server what the session IS, which is also what arms
      // App's preparation poller — it watches `preparing` on the snapshot,
      // not the result of this call.
      if (result.ok && "session" in result) {
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

          // Intersected with what this bank actually declares, because a
          // preselection can arrive from anywhere: a bookmark, a link
          // shared after a bank switch, a domain the loaded exam has never
          // heard of. A name the server would not recognise must not reach
          // it as a filter — it would narrow the draw to nothing.
          const available = new Set((loaded.domains ?? []).map((d) => d.name));
          const selected = (picked ?? presetDomains).filter((d) => available.has(d));

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
                    filtered={selected.length > 0}
                    onStart={() => handleStart(m.id, selected)}
                  />
                ))}
              </ul>

              {startError && <p className="error-text">{startError}</p>}
              {/* Say why rather than leaving three dead buttons: the
                  catalog is worth browsing on a phone, sitting an exam
                  is not. */}
              {blocked && <p className="mode-blocked">{strings.mobile.startDisabled}</p>}

              <DrawPanel exam={loaded} selected={selected} onSelect={setPicked} />

              <div className="mode-fine">
                <ul className="page-tips">
                  {(isMcq ? strings.mode.tipsMcq : strings.mode.tips).map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                  <li>{strings.mode.tipTimer}</li>
                </ul>
                {/* Grouped, so `.mode-fine`'s space-between keeps holding
                    the tips list against one edge and the buttons against
                    the other. Ungrouped, a second button became a third
                    flex child and the first one drifted into the middle
                    of the row. */}
                <div className="mode-fine-actions">
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
                  {/* Drawn only when the bank ships a tips.md. A control
                      that opens an empty sheet is worse than no control,
                      and the server is the only thing that knows — tips
                      are per bank, so there is no per-question count to
                      infer it from the way the hint tray does. Shown for
                      both engines: an mcq bank is free to ship its own. */}
                  {loaded.hasTips && (
                    <button type="button" className="btn" onClick={() => setTipsOpen(true)}>
                      {strings.tips.open}
                    </button>
                  )}
                </div>
              </div>
            </>
          );
        }}
      </Async>

      {introOpen && (
        <ExamIntro
          onClose={() => setIntroOpen(false)}
          durationSeconds={exam?.durationSeconds}
        />
      )}

      {tipsOpen && <ExamTips onClose={() => setTipsOpen(false)} />}
    </div>
  );
}
