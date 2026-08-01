import { useEffect, useState } from "react";
import {
  getBanks,
  getExam,
  getSession,
  startControlSwitch,
  startSession,
  type BankEntry,
  type BanksResponse,
  type ControlActionResponse,
  type ExamMode,
  type SessionMode,
  type SessionSnapshot,
} from "../api";
import { Async } from "../components/Async";
import { Dialog } from "../components/Dialog";
import { useDesktopGate } from "../components/DesktopRequired";
import { ExamIntro, markIntroSeen } from "../components/ExamIntro";
import { Skeleton } from "../components/Pending";
import { formatDuration } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { strings } from "../strings";

// Fallback for a facilitator that predates the modes field, so the
// picker still renders rather than collapsing to nothing.
const DEFAULT_MODES: ExamMode[] = [
  { id: "exam", durationSeconds: 7200, untimed: false, helpAllowed: false },
  { id: "training", durationSeconds: 0, untimed: true, helpAllowed: true },
  { id: "speed", durationSeconds: 3600, untimed: false, helpAllowed: false },
];

// The stat labels are known before the numbers are, so the placeholder can
// carry the real headings and reserve the real height.
const STAT_LABELS = [
  strings.start.durationLabel,
  strings.start.passingScoreLabel,
  strings.start.questionsLabel,
  strings.start.kubernetesLabel,
];

interface StartProps {
  onSessionChange: (session: SessionSnapshot) => void;
  // Takes the *starter*, not its result, so the switch runs inside App's
  // runControlAction: that wrapper is what turns both a refused job
  // ({ok:false}) and a rejected fetch into a toast. Handing it a result
  // could only ever cover the first, and a bank switch fails the second
  // way whenever the conductor's host is unreachable.
  onControlStart: (start: () => Promise<ControlActionResponse>) => void;
  // Bumped by App whenever a control job finishes: a completed bank
  // switch changes the active exam while Start stays mounted, so the
  // exam summary and catalog must be refetched, not kept from mount.
  catalogVersion: number;
  // Lifts the catalog's id -> title map to App, so the control overlay
  // can name the exam a switch targets instead of showing its slug.
  // Reported from here rather than refetched so there's one request.
  onBanksLoaded: (banks: BanksResponse) => void;
}

// Lobby: the exam catalog (pick/switch banks via the conductor) plus the
// active exam's summary and the Start button. A 409 from
// POST /api/session/start (e.g. a concurrent start, or the poller having
// just observed the exam began) is handled by refetching the
// authoritative session state rather than showing an error — App will
// then route to whatever screen that state implies.
export function Start({
  onSessionChange,
  onControlStart,
  catalogVersion,
  onBanksLoaded,
}: StartProps) {
  const [confirmBank, setConfirmBank] = useState<BankEntry | null>(null);
  const [switching, setSwitching] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // Exam is the default on purpose: the simulator's whole point is the
  // real thing, and training is the deliberate opt-out.
  const [mode, setMode] = useState<Exclude<SessionMode, "">>("exam");
  // Reading how the exam works should not cost exam time, so the same
  // card the exam screen shows on first run is reachable here, before
  // the clock exists.
  const [introOpen, setIntroOpen] = useState(false);
  // A phone can browse the catalog; it cannot run a hands-on exam. An
  // mcq exam it CAN run — the gate is about the terminal-and-desktop
  // split screen, which mcq does not have.
  const phoneBlocked = useDesktopGate() === "blocked";

  // Through useAsync so it also drives the top progress bar. It used to be
  // a hand-rolled cancelled flag with no indicator at all: while it was in
  // flight the card showed the fallback title and no stats, which is
  // indistinguishable from the endpoint being down.
  const examState = useAsync((signal) => getExam(signal), [catalogVersion]);
  const exam = examState.data;
  const isMcq = exam?.examType === "mcq";
  const examBlocked = phoneBlocked && !isMcq;

  const banksState = useAsync((signal) => getBanks(signal), [catalogVersion]);

  useEffect(() => {
    if (banksState.data) onBanksLoaded(banksState.data);
  }, [banksState.data, onBanksLoaded]);

  const handleStart = async () => {
    setStarting(true);
    setStartError(null);
    try {
      const result = await startSession(mode);
      if (result.ok) {
        onSessionChange(result.session);
      } else {
        // Someone/something already changed session state (409) —
        // refetch and let App re-derive the screen from the truth.
        const current = await getSession();
        onSessionChange(current);
      }
    } catch (err) {
      setStartError(String(err));
    } finally {
      setStarting(false);
    }
  };

  // The dialog's own concerns (close on acceptance, release the disabled
  // state either way) live inside the starter; whether the user hears
  // about a failure is App's, through the wrapper it already owns.
  const handleConfirmSwitch = () => {
    if (!confirmBank) return;
    const bank = confirmBank;
    setSwitching(true);
    onControlStart(async () => {
      try {
        const result = await startControlSwitch(bank.id);
        if (result.ok) setConfirmBank(null);
        return result;
      } finally {
        setSwitching(false);
      }
    });
  };

  const bankBadge = (b: BankEntry, banks: BanksResponse): string | null => {
    if (b.id === banks.active) return strings.lobby.active;
    if (b.comingSoon) return strings.lobby.comingSoon;
    if (!b.available) return strings.lobby.unavailable;
    return null;
  };

  return (
    <div className="start-screen">
      <div className="start-card">
        {/* The card reads top to bottom as one decision: this exam, these
            numbers, this mode, Start. Switching exams is real but
            secondary, so the catalog follows the primary act instead of
            standing between the title and the button. */}
        <header className="start-hero">
          <p className="start-eyebrow">{strings.lobby.activeExam}</p>
          <h1>{exam?.title ?? strings.start.fallbackTitle}</h1>
        </header>
        {examState.error && <p className="error-text">{strings.start.examFailed(examState.error)}</p>}

        {/* The stats box reserves its own height whether or not the numbers
            have landed, so the card does not jump when they do. */}
        {!exam && !examState.error && (
          <div className="start-stats" aria-hidden="true">
            {STAT_LABELS.map((label) => (
              <div key={label}>
                <div className="start-stat-label">{label}</div>
                <div className="start-stat-value">
                  <Skeleton width="3.5em" />
                </div>
              </div>
            ))}
          </div>
        )}

        {exam && (
          <div className="start-stats">
            <div>
              <div className="start-stat-label">{strings.start.durationLabel}</div>
              <div className="start-stat-value">{formatDuration(exam.durationSeconds)}</div>
            </div>
            <div>
              <div className="start-stat-label">{strings.start.passingScoreLabel}</div>
              <div className="start-stat-value">{exam.passingScore}%</div>
            </div>
            <div>
              <div className="start-stat-label">{strings.start.questionsLabel}</div>
              <div className="start-stat-value">{exam.questionCount}</div>
            </div>
            <div>
              <div className="start-stat-label">{strings.start.kubernetesLabel}</div>
              <div className="start-stat-value">{exam.kubernetesVersion}</div>
            </div>
          </div>
        )}

        {/* The picker sits directly above the button that acts on it, so
            the choice and its consequence are one glance apart. */}
        <fieldset className="mode-picker">
          <legend>{strings.start.modeLegend}</legend>
          {(exam?.modes ?? DEFAULT_MODES).map((m) => (
            <label key={m.id} className={`mode-option${mode === m.id ? " mode-option-on" : ""}`}>
              <input
                type="radio"
                name="attempt-mode"
                value={m.id}
                checked={mode === m.id}
                onChange={() => setMode(m.id)}
              />
              <span className="mode-name">{strings.modes[m.id].label}</span>
              <span className="mode-blurb">
                {strings.modes[m.id].blurb(Math.round(m.durationSeconds / 60))}
              </span>
            </label>
          ))}
        </fieldset>

        {startError && <p className="error-text">{startError}</p>}

        <div className="start-actions">
          <button
            className="btn btn-primary"
            onClick={handleStart}
            disabled={starting || examBlocked}
          >
            {starting ? strings.start.starting : strings.start.start(mode)}
          </button>
          {/* Marks the card seen: someone who read it here should not
              have it thrown at them again the moment the exam opens.
              Hidden for mcq — the card walks through the split-screen
              desktop layout, none of which exists there. */}
          {!isMcq && (
            <button
              className="btn"
              onClick={() => {
                markIntroSeen();
                setIntroOpen(true);
              }}
            >
              {strings.intro.open}
            </button>
          )}
          {/* Say why rather than leaving a dead button: the catalog is
              worth browsing on a phone, starting an exam is not. */}
          {examBlocked && <p className="start-blocked">{strings.mobile.startDisabled}</p>}
        </div>

        {/* Fine print for the attempt ahead, after the act it qualifies.
            The clock line tracks the chosen mode so an untimed Training
            selection is never contradicted two lines below the button. */}
        <ul className="start-tips">
          {(isMcq ? strings.start.tipsMcq : strings.start.tips).map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
          <li>{strings.start.tipTimer(mode)}</li>
        </ul>

        <Async
          state={banksState}
          loading={<p className="catalog-loading">{strings.app.working}</p>}
          error={(message, reload) => (
            <div className="catalog-error" role="alert">
              <p className="catalog-error-title">{strings.start.catalogErrorTitle}</p>
              <p className="catalog-error-body">{strings.start.catalogErrorBody(message)}</p>
              <button type="button" className="btn" onClick={reload}>
                {strings.start.catalogRetry}
              </button>
            </div>
          )}
        >
          {(banks) =>
            banks.banks.length > 0 && (
              <div className="bank-catalog">
                <h2>{strings.lobby.switchExam}</h2>
                <ul className="bank-list">
                  {banks.banks.map((b) => {
                    const isActive = b.id === banks.active;
                    const badge = bankBadge(b, banks);
                    return (
                      <li key={b.id}>
                        <button
                          className={`bank-card${isActive ? " bank-active" : ""}`}
                          disabled={!b.available || isActive}
                          onClick={() => setConfirmBank(b)}
                        >
                          <span className="bank-title">
                            {b.title}
                            {badge && <span className="bank-badge">{badge}</span>}
                          </span>
                          <span className="bank-meta">
                            {b.certification}
                            {b.questionCount
                              ? ` · ${strings.lobby.questions(b.questionCount)}`
                              : ""}
                            {b.durationSeconds
                              ? ` · ${formatDuration(b.durationSeconds)}`
                              : ""}
                          </span>
                          {/* The pitch used to hide in a title= tooltip,
                              which touch devices never see. */}
                          {b.description && (
                            <span className="bank-desc">{b.description}</span>
                          )}
                          {b.note && !b.available && (
                            <span className="bank-note">{b.note}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          }
        </Async>

        <p className="start-footer">{strings.info.footerLine}</p>
      </div>

      {/* Was a bare pair of divs duplicating Dialog's markup without any
          of its behaviour — no role, no aria-modal, no focus trap, no
          Escape. The axe suite missed it because the lobby scan never
          opened it. */}
      {introOpen && <ExamIntro onClose={() => setIntroOpen(false)} />}

      {confirmBank && (
        <Dialog
          title={strings.lobby.switchConfirmTitle(confirmBank.title)}
          onClose={() => setConfirmBank(null)}
        >
          <p>{strings.lobby.switchConfirmBody}</p>
          <div className="confirm-actions">
            <button
              className="btn"
              onClick={() => setConfirmBank(null)}
              disabled={switching}
            >
              {strings.lobby.cancel}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleConfirmSwitch}
              disabled={switching}
            >
              {/* Both buttons went grey and nothing else changed, which
                  reads as a stuck dialog rather than a request in flight. */}
              {switching ? strings.control.starting : strings.lobby.switchConfirm}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
