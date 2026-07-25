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
  type ExamInfo,
  type SessionSnapshot,
} from "../api";
import { Async } from "../components/Async";
import { Dialog } from "../components/Dialog";
import { useDesktopGate } from "../components/DesktopRequired";
import { formatDuration } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { strings } from "../strings";

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
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [examError, setExamError] = useState<string | null>(null);
  const [confirmBank, setConfirmBank] = useState<BankEntry | null>(null);
  const [switching, setSwitching] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // A phone can browse the catalog; it cannot run the exam.
  const examBlocked = useDesktopGate() === "blocked";

  useEffect(() => {
    let cancelled = false;
    getExam()
      .then((e) => {
        if (!cancelled) setExam(e);
      })
      .catch((err) => {
        if (!cancelled) setExamError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [catalogVersion]);

  const banksState = useAsync(getBanks, [catalogVersion]);

  useEffect(() => {
    if (banksState.data) onBanksLoaded(banksState.data);
  }, [banksState.data, onBanksLoaded]);

  const handleStart = async () => {
    setStarting(true);
    setStartError(null);
    try {
      const result = await startSession();
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
        <h1>{exam?.title ?? strings.start.fallbackTitle}</h1>
        {examError && <p className="error-text">{examError}</p>}

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
                <h2>{strings.lobby.chooseExam}</h2>
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
                          title={b.note ?? b.description ?? ""}
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
              <div className="start-stat-value">{exam.questions.length}</div>
            </div>
            <div>
              <div className="start-stat-label">{strings.start.kubernetesLabel}</div>
              <div className="start-stat-value">{exam.kubernetesVersion}</div>
            </div>
          </div>
        )}

        <ul className="start-tips">
          {strings.start.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>

        {startError && <p className="error-text">{startError}</p>}

        <div className="start-actions">
          <button
            className="btn btn-primary"
            onClick={handleStart}
            disabled={starting || examBlocked}
          >
            {starting ? strings.start.starting : strings.start.startExam}
          </button>
          {/* Say why rather than leaving a dead button: the catalog is
              worth browsing on a phone, starting an exam is not. */}
          {examBlocked && <p className="start-blocked">{strings.mobile.startDisabled}</p>}
        </div>

        <p className="start-footer">{strings.info.footerLine}</p>
      </div>

      {/* Was a bare pair of divs duplicating Dialog's markup without any
          of its behaviour — no role, no aria-modal, no focus trap, no
          Escape. The axe suite missed it because the lobby scan never
          opened it. */}
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
              {strings.lobby.switchConfirm}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
