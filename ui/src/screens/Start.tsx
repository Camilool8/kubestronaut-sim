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
import { formatDuration } from "../lib/format";
import { strings } from "../strings";

interface StartProps {
  onSessionChange: (session: SessionSnapshot) => void;
  onControlStart: (result: ControlActionResponse) => void;
}

// Lobby: the exam catalog (pick/switch banks via the conductor) plus the
// active exam's summary and the Start button. A 409 from
// POST /api/session/start (e.g. a concurrent start, or the poller having
// just observed the exam began) is handled by refetching the
// authoritative session state rather than showing an error — App will
// then route to whatever screen that state implies.
export function Start({ onSessionChange, onControlStart }: StartProps) {
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [examError, setExamError] = useState<string | null>(null);
  const [banks, setBanks] = useState<BanksResponse | null>(null);
  const [confirmBank, setConfirmBank] = useState<BankEntry | null>(null);
  const [switching, setSwitching] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getExam()
      .then((e) => {
        if (!cancelled) setExam(e);
      })
      .catch((err) => {
        if (!cancelled) setExamError(String(err));
      });
    getBanks()
      .then((b) => {
        if (!cancelled) setBanks(b);
      })
      .catch(() => {
        // Catalog unavailable is non-fatal: the active exam still works;
        // the lobby just can't offer switching.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleConfirmSwitch = async () => {
    if (!confirmBank) return;
    setSwitching(true);
    try {
      const result = await startControlSwitch(confirmBank.id);
      onControlStart(result);
      if (result.ok) setConfirmBank(null);
    } finally {
      setSwitching(false);
    }
  };

  const bankBadge = (b: BankEntry): string | null => {
    if (banks && b.id === banks.active) return strings.lobby.active;
    if (b.comingSoon) return strings.lobby.comingSoon;
    if (!b.available) return strings.lobby.unavailable;
    return null;
  };

  return (
    <div className="start-screen">
      <div className="start-card">
        <h1>{exam?.title ?? strings.start.fallbackTitle}</h1>
        {examError && <p className="error-text">{examError}</p>}

        {banks && banks.banks.length > 0 && (
          <div className="bank-catalog">
            <h2>{strings.lobby.chooseExam}</h2>
            <ul className="bank-list">
              {banks.banks.map((b) => {
                const isActive = b.id === banks.active;
                const badge = bankBadge(b);
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
          <button className="btn btn-primary" onClick={handleStart} disabled={starting}>
            {starting ? strings.start.starting : strings.start.startExam}
          </button>
        </div>

        <p className="start-footer">{strings.info.footerLine}</p>
      </div>

      {confirmBank && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <h2>{strings.lobby.switchConfirmTitle(confirmBank.title)}</h2>
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
          </div>
        </div>
      )}
    </div>
  );
}
