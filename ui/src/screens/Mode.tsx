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
import { DesktopRequired, useDesktopGate } from "../components/DesktopRequired";
import { ExamIntro, markIntroSeen } from "../components/ExamIntro";
import { ExamTips } from "../components/ExamTips";
import { Icon } from "../components/Icon";
import { parseDomainsParam } from "../lib/attemptHistory";
import { formatDuration } from "../lib/format";
import { navigate, useRoute } from "../lib/useHashRoute";
import { useAsync } from "../lib/useAsync";
import { strings } from "../strings";

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

  fullSeconds: number;
  starting: boolean;
  disabled: boolean;

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

            {shortened && (
              <span className="mode-clock-full">
                {strings.mode.fullClock(formatDuration(fullSeconds))}
              </span>
            )}
          </p>

          <p className="mode-blurb">{copy.blurb(minutes)}</p>

          <ul className="mode-caps" aria-label={strings.mode.capListLabel}>
            <Capability on={mode.helpAllowed} label={strings.mode.capHelp} />
            <Capability on={mode.gradesPerTask} label={strings.mode.capGrade} />
            <Capability on={mode.recorded} label={strings.mode.capRecorded} />
          </ul>

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

  selected: string[];
  onSelect: (domains: string[]) => void;
}

function DrawPanel({ exam, selected, onSelect }: DrawPanelProps) {
  const domains = exam.domains ?? [];
  const chosen = new Set(selected);

  const pool = exam.questions.length;
  const declared = exam.questionCount || pool;
  const pooled = pool > declared;

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
              ? exam.levelMixed
                ? strings.mode.drawPooledMixed(drawn, pool)
                : strings.mode.drawPooled(drawn, pool)
              : strings.mode.drawAll(drawn)}
        </p>
      </div>

      {domains.length === 0 ? (
        <DrawTags exam={exam} pooled={pooled} />
      ) : (
        <div className="draw-panel-domains">
          <h3>{strings.mode.chipsTitle}</h3>

          <div className="draw-chips" role="group" aria-label={strings.mode.chipsLabel}>

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

                <Icon name="check" className="draw-chip-mark" />
                {d.name}
                <span className="domain-count">{d.questionCount}</span>
              </button>
            ))}
          </div>

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
  bankId: string;
  catalogVersion: number;
  onSessionChange: (session: SessionSnapshot) => void;

  /** Called when a start answers 202: the attempt is drawn but not yet begun. */
  onPreparing?: () => void;
}

export function Mode({ bankId, catalogVersion, onSessionChange, onPreparing }: ModeProps) {
  const [starting, setStarting] = useState<SessionMode | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);

  const examState = useAsync((signal) => getExam(signal), [catalogVersion]);
  const exam = examState.data;
  const isMcq = exam?.examType === "mcq";

  const query = useRoute().query;
  const queryKey = query.toString();
  const presetDomains = useMemo(
    () => parseDomainsParam(new URLSearchParams(queryKey)),
    [queryKey],
  );
  const [picked, setPicked] = useState<string[] | null>(null);

  const blocked = useDesktopGate() === "blocked" && !isMcq;

  const wrongExam = exam !== null && exam.name !== bankId;
  useEffect(() => {
    if (wrongExam) navigate("/exams", { replace: true });
  }, [wrongExam]);

  const handleStart = async (mode: Exclude<SessionMode, "">, domains: string[]) => {
    setStarting(mode);
    setStartError(null);
    try {
      const result = await startSession(domains.length > 0 ? { mode, domains } : mode);

      if (result.ok && "session" in result) {
        onSessionChange(result.session);
        return;
      }

      if (result.ok) {
        // A pooled bank answers 202 and seeds the drawn tasks in the
        // background. Wake the control poll, and leave `starting` set: the
        // attempt has not begun, and clearing it here re-enabled every mode
        // button while the cluster was still being prepared. App takes over
        // and swaps in the preparing screen.
        onPreparing?.();
        onSessionChange(await getSession());
        return;
      }

      // A refused start used to be swallowed. Say why, and still resync: a 409
      // can mean the attempt is already running somewhere else, and the fresh
      // snapshot is what moves this tab onto it.
      setStartError(result.error);
      setStarting(null);
      onSessionChange(await getSession());
    } catch (err) {
      setStartError(String(err));
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
            return <p className="page-loading">{strings.mode.wrongExam}</p>;
          }

          if (blocked) {
            return <DesktopRequired verdict="blocked" />;
          }
          const modes = loaded.modes?.length ? loaded.modes : DEFAULT_MODES;
          const fullSeconds =
            modes.find((m) => m.id === "exam")?.durationSeconds ?? loaded.durationSeconds;

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
                    disabled={starting !== null && starting !== m.id}
                    filtered={selected.length > 0}
                    onStart={() => handleStart(m.id, selected)}
                  />
                ))}
              </ul>

              {startError && <p className="error-text">{startError}</p>}

              <DrawPanel exam={loaded} selected={selected} onSelect={setPicked} />

              <div className="mode-fine">
                <ul className="page-tips">
                  {(isMcq ? strings.mode.tipsMcq : strings.mode.tips).map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                  <li>{strings.mode.tipTimer}</li>
                </ul>

                <div className="mode-fine-actions">

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
