import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  getCatalog,
  startControlSwitch,
  type BankEntry,
  type CatalogExam,
  type ControlActionResponse,
  type BanksResponse,
  type SessionKind,
} from "../api";
import { Async } from "../components/Async";
import { CertMark, hasCertMark } from "../components/CertMark";
import { Dialog } from "../components/Dialog";
import { useDesktopGate } from "../components/DesktopRequired";
import { pathStatus } from "../lib/attemptHistory";
import { formatDuration } from "../lib/format";
import { navigate } from "../lib/useHashRoute";
import { useAsync } from "../lib/useAsync";
import { strings } from "../strings";

function engineTint(bank: BankEntry): string {
  if (!bank.available) return "soon";
  return bank.examType === "mcq" ? "mcq" : "hands-on";
}

function engineName(bank: BankEntry): string {
  if (bank.examType === "mcq") return strings.exams.engineMcq;
  if (bank.examType === "hands-on") return strings.exams.enginePractical;
  return strings.exams.engineUnknown;
}

function examHeading(bank: BankEntry): string {
  return bank.certification || bank.title;
}

function examSubtitle(bank: BankEntry): string {
  return strings.exams.certNames[bank.certification ?? ""] ?? bank.title;
}

function examStats(bank: BankEntry): [string, ReactNode][] {
  const stats: [string, ReactNode][] = [];
  if (bank.durationSeconds) {
    stats.push([strings.exams.durationLabel, formatDuration(bank.durationSeconds)]);
  }
  if (bank.questionCount) {
    const pooled = (bank.poolCount ?? 0) > bank.questionCount;
    const label = pooled
      ? strings.exams.drawnLabel
      : bank.examType === "mcq"
        ? strings.exams.questionsLabel
        : strings.exams.tasksLabel;
    stats.push([
      label,
      pooled ? (
        <>
          {bank.questionCount} <span className="exam-stat-of">/ {bank.poolCount}</span>
        </>
      ) : (
        bank.questionCount
      ),
    ]);
  }
  if (bank.passingScore) {
    stats.push([strings.exams.passingLabel, `${bank.passingScore}%`]);
  }
  stats.push([strings.exams.engineLabel, <span className="exam-stat-engine">{engineName(bank)}</span>]);
  return stats;
}

function ExamAvatar({ bank }: { bank: BankEntry }) {
  if (!bank.certification) return null;
  return (
    <span className="exam-avatar" aria-hidden="true">
      <CertMark certification={bank.certification} />
      {!hasCertMark(bank.certification) && bank.certification}
    </span>
  );
}

function ExamAttempts({ exam }: { exam: CatalogExam }) {
  const { progress } = exam;
  const label = progress.passed
    ? strings.exams.bestPassed(progress.counted)
    : progress.counted > 0
      ? strings.exams.bestLabel(progress.counted)
      : strings.exams.bestDrills(progress.attempts);
  const best = progress.bestPercent;

  return (
    <div className="exam-attempts">
      <div className="exam-attempts-head">
        <span>{label}</span>
        <span className="exam-attempts-figure">
          {best === undefined ? strings.exams.bestNoScore : `${Math.round(best)}%`}
        </span>
      </div>

      <span className="exam-attempts-bar" aria-hidden="true" data-passed={progress.passed}>
        <span className="exam-attempts-fill" style={{ width: `${best ?? 0}%` }} />
      </span>
    </div>
  );
}

function ExamCard({ bank, onChoose }: { bank: CatalogExam; onChoose: () => void }) {
  return (
    <li>
      <article className="exam-card" data-engine={engineTint(bank)}>
        <div className="exam-card-head">
          <ExamAvatar bank={bank} />
          <div className="exam-card-name">
            <h2>{examHeading(bank)}</h2>
            <p>{examSubtitle(bank)}</p>
          </div>
          <span className="exam-badge exam-badge-live">{strings.exams.live}</span>
        </div>

        <dl className="exam-stats">
          {examStats(bank).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        {bank.progress.attempts > 0 ? (
          <ExamAttempts exam={bank} />
        ) : (
          bank.description && <p className="exam-desc">{bank.description}</p>
        )}

        <div className="exam-card-actions">
          <button type="button" className="btn btn-primary" onClick={onChoose}>
            {strings.exams.choose}
          </button>
        </div>
      </article>
    </li>
  );
}

function SoonCard({ bank, badge }: { bank: BankEntry; badge?: string }) {
  return (
    <li>
      <article className="exam-card exam-card-soon" data-engine="soon">
        <div className="exam-card-head">
          <ExamAvatar bank={bank} />
          <div className="exam-card-name">
            <h2>{examHeading(bank)}</h2>
            <p>{examSubtitle(bank)}</p>
          </div>
          <span className="exam-badge">
            {badge ?? (bank.comingSoon ? strings.exams.soon : strings.exams.unavailable)}
          </span>
        </div>

        {bank.note && <p className="exam-note">{bank.note}</p>}
      </article>
    </li>
  );
}

function seatFor(
  exams: CatalogExam[],
  seat: SessionKind | undefined,
  seatBank: string | undefined,
): { offered: CatalogExam[]; wrongSeat: Set<string> } {
  const wrongSeat = new Set<string>();
  if (!seat) return { offered: exams, wrongSeat };
  const offered = exams.map((bank) => {
    if (!bank.available) return bank;
    if (seatBank) {
      if (bank.id === seatBank) return bank;
      wrongSeat.add(bank.id);
      return {
        ...bank,
        available: false,
        comingSoon: false,
        note: strings.exams.otherExamNote,
      };
    }
    const needs = bank.examType === "mcq" ? "mcq" : "practical";
    if (needs === seat) return bank;
    wrongSeat.add(bank.id);
    return {
      ...bank,
      available: false,

      comingSoon: false,
      note: strings.exams.wrongSeatNote(
        needs === "mcq" ? strings.exams.engineMcq : strings.exams.enginePractical,
      ),
    };
  });
  return { offered, wrongSeat };
}

function deviceFor(exams: CatalogExam[], blocked: boolean): CatalogExam[] {
  if (!blocked) return exams;
  return exams.map((bank) => {
    if (!bank.available || bank.examType === "mcq") return bank;
    return {
      ...bank,
      available: false,

      comingSoon: false,
      note: strings.mobile.catalogNote,
    };
  });
}

interface ExamsProps {
  catalogVersion: number;

  seatKind?: SessionKind;

  seatBank?: string;

  onControlStart: (start: () => Promise<ControlActionResponse>) => void;

  onBanksLoaded: (banks: BanksResponse) => void;
}

export function Exams({
  catalogVersion,
  seatKind,
  seatBank,
  onControlStart,
  onBanksLoaded,
}: ExamsProps) {
  const [confirm, setConfirm] = useState<CatalogExam | null>(null);
  const [switching, setSwitching] = useState(false);

  const pendingMode = useRef<string | null>(null);

  const blocked = useDesktopGate() === "blocked";

  const catalogState = useAsync((signal) => getCatalog(signal), [catalogVersion]);
  const active = catalogState.data?.active;
  const catalog = catalogState.data;

  useEffect(() => {
    if (catalog) onBanksLoaded({ active: catalog.active, banks: catalog.exams });
  }, [catalog, onBanksLoaded]);

  useEffect(() => {
    if (!pendingMode.current || active !== pendingMode.current) return;
    const target = pendingMode.current;
    pendingMode.current = null;
    navigate(`/exams/${target}/mode`);
  }, [active]);

  const chooseMode = (bank: CatalogExam) => {
    if (bank.id === active) {
      navigate(`/exams/${bank.id}/mode`);
      return;
    }
    setConfirm(bank);
  };

  const handleConfirm = () => {
    if (!confirm) return;
    const bank = confirm;
    setSwitching(true);
    onControlStart(async () => {
      try {
        const result = await startControlSwitch(bank.id);
        if (result.ok) {
          setConfirm(null);
          pendingMode.current = bank.id;
        }
        return result;
      } finally {
        setSwitching(false);
      }
    });
  };

  return (
    <div className="page exams-screen">
      <Async
        state={catalogState}
        loading={<p className="page-loading">{strings.app.working}</p>}
        error={(message, reload) => (
          <div className="catalog-error" role="alert">
            <p className="catalog-error-title">{strings.exams.catalogErrorTitle}</p>
            <p className="catalog-error-body">{strings.exams.catalogErrorBody(message)}</p>
            <button type="button" className="btn" onClick={reload}>
              {strings.exams.catalogRetry}
            </button>
          </div>
        )}
      >
        {(loaded) => {
          const { offered, wrongSeat } = seatFor(loaded.exams, seatKind, seatBank);
          const shown = deviceFor(offered, blocked);
          const live = shown.filter((b) => b.available);
          const soon = shown.filter((b) => !b.available);
          return (
            <>
              <header className="page-head">
                <div>
                  <h1>{strings.exams.title}</h1>
                  <p className="page-lead">{strings.exams.lead}</p>
                </div>
                {loaded.exams.length > 0 && (
                  <div className="coverage">
                    <div className="coverage-figure">
                      <span className="coverage-label">{strings.exams.coverageLabel}</span>
                      <span className="coverage-value">
                        {strings.exams.coverage(
                          loaded.summary.passedCount,
                          loaded.summary.trackCount,
                        )}
                      </span>
                    </div>

                    <span className="coverage-bar" aria-hidden="true">
                      {loaded.exams.map((b) => (
                        <span key={b.id} data-state={pathStatus(b)} />
                      ))}
                    </span>
                  </div>
                )}
              </header>

              {loaded.exams.length === 0 && <p className="page-empty">{strings.exams.empty}</p>}

              {live.length > 0 && (
                <ul className="exam-grid" aria-label={strings.exams.liveListLabel}>
                  {live.map((b) => (
                    <ExamCard key={b.id} bank={b} onChoose={() => chooseMode(b)} />
                  ))}
                </ul>
              )}

              {soon.length > 0 && (
                <ul className="exam-grid exam-grid-soon" aria-label={strings.exams.soonListLabel}>
                  {soon.map((b) => (
                    <SoonCard
                      key={b.id}
                      bank={b}
                      badge={wrongSeat.has(b.id) ? strings.exams.wrongSeat : undefined}
                    />
                  ))}
                </ul>
              )}

              <p className="page-footer">{strings.info.footerLine}</p>
            </>
          );
        }}
      </Async>

      {confirm && (
        <Dialog
          title={
            active
              ? strings.lobby.switchConfirmTitle(examHeading(confirm))
              : strings.lobby.buildConfirmTitle(examHeading(confirm))
          }
          onClose={() => setConfirm(null)}
        >

          <p>{active ? strings.lobby.switchConfirmBody : strings.lobby.buildConfirmBody}</p>
          <div className="confirm-actions">
            <button className="btn" onClick={() => setConfirm(null)} disabled={switching}>
              {strings.lobby.cancel}
            </button>
            <button className="btn btn-primary" onClick={handleConfirm} disabled={switching}>

              {switching
                ? strings.control.starting
                : active
                  ? strings.lobby.switchConfirm
                  : strings.lobby.buildConfirm}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
