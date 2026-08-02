import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  getBanks,
  startControlSwitch,
  type BankEntry,
  type BanksResponse,
  type ControlActionResponse,
} from "../api";
import { Async } from "../components/Async";
import { Dialog } from "../components/Dialog";
import { formatDuration } from "../lib/format";
import { navigate } from "../lib/useHashRoute";
import { useAsync } from "../lib/useAsync";
import { strings } from "../strings";

/**
 * Which tint an exam wears — see the --exam-tint family in tokens.css.
 * Keyed on the engine, so the colour says the same thing the card's own
 * Engine cell says in words. A bank that cannot be sat is outside the
 * hue system entirely.
 */
function engineTint(bank: BankEntry): string {
  if (!bank.available) return "soon";
  return bank.examType === "mcq" ? "mcq" : "hands-on";
}

function engineName(bank: BankEntry): string {
  if (bank.examType === "mcq") return strings.exams.engineMcq;
  if (bank.examType === "hands-on") return strings.exams.enginePractical;
  return strings.exams.engineUnknown;
}

/** The heading: the certification if the bank names one, else its title. */
function examHeading(bank: BankEntry): string {
  return bank.certification || bank.title;
}

/**
 * The line under the heading. A known certification expands to its full
 * name; anything else falls back to the bank's own title, which is the
 * only other thing that describes it.
 */
function examSubtitle(bank: BankEntry): string {
  return strings.exams.certNames[bank.certification ?? ""] ?? bank.title;
}

/**
 * The four-cell strip. Built by pushing rather than declared, because a
 * coming-soon entry carries none of these numbers and rendering "0m /
 * 0%" would be worse than rendering three cells.
 */
function examStats(bank: BankEntry): [string, ReactNode][] {
  const stats: [string, ReactNode][] = [];
  if (bank.durationSeconds) {
    stats.push([strings.exams.durationLabel, formatDuration(bank.durationSeconds)]);
  }
  if (bank.questionCount) {
    // The pool half appears only when there IS a pool: "22 / 22" would
    // advertise a random draw this bank does not do.
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

/**
 * The tinted tile. Only a certification goes in it — never `title`,
 * which is a sentence ("CKA Mock Exam 01") and would spill out of a 44px
 * square. A bank that claims no certification simply has no tile.
 *
 * The whole acronym, not the design's two-letter crop: CKA, CKAD and CKS
 * all crop to "CK". Four mono characters fit, and the tile is decoration
 * anyway — the same string is the heading beside it.
 */
function ExamAvatar({ bank }: { bank: BankEntry }) {
  if (!bank.certification) return null;
  return (
    <span className="exam-avatar" aria-hidden="true">
      {bank.certification}
    </span>
  );
}

function ExamCard({ bank, onChoose }: { bank: BankEntry; onChoose: () => void }) {
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

        {/* dt before dd, as the grammar requires: a screen reader reads
            "Duration, 2h". The figure is drawn ABOVE its label by
            column-reverse in CSS, which is a visual order only. */}
        <dl className="exam-stats">
          {examStats(bank).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        {/* Where the brief draws a best-attempt bar. Nothing records an
            attempt yet, so this holds the bank's own one-line pitch —
            which was previously buried in a title= tooltip — rather than
            a number the product cannot know. */}
        {bank.description && <p className="exam-desc">{bank.description}</p>}

        <div className="exam-card-actions">
          <button type="button" className="btn btn-primary" onClick={onChoose}>
            {strings.exams.choose}
          </button>
        </div>
      </article>
    </li>
  );
}

function SoonCard({ bank }: { bank: BankEntry }) {
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
            {bank.comingSoon ? strings.exams.soon : strings.exams.unavailable}
          </span>
        </div>
        {/* The reason is the entire point of rendering an exam nobody can
            sit, so it is never dimmed and never truncated. */}
        {bank.note && <p className="exam-note">{bank.note}</p>}
      </article>
    </li>
  );
}

interface ExamsProps {
  // Bumped by App whenever a control job finishes: a completed switch
  // changes which bank is active while this screen stays mounted.
  catalogVersion: number;
  // Takes the *starter*, not its result, so the switch runs inside App's
  // runControlAction — the wrapper that turns both a refused job
  // ({ok:false}) and a rejected fetch into a toast.
  onControlStart: (start: () => Promise<ControlActionResponse>) => void;
  // Lifts the catalog to App, which needs it to name the exam a switch
  // targets and to fill the mode screen's header. Reported from here
  // rather than refetched so there is one request.
  onBanksLoaded: (banks: BanksResponse) => void;
}

/**
 * The exam selector: every certification on the path, the two that can
 * be sat today first.
 *
 * Only one exam is ever LOADED — a bank is a Kubernetes cluster seeded
 * for its questions — so choosing any other one is a 2-4 minute
 * destructive rebuild rather than a navigation. That is the one thing
 * this screen must not smooth over, and it is why every card carries the
 * same "Choose a mode" verb but a card that is not the active bank goes
 * through a confirmation first.
 */
export function Exams({ catalogVersion, onControlStart, onBanksLoaded }: ExamsProps) {
  const [confirm, setConfirm] = useState<BankEntry | null>(null);
  const [switching, setSwitching] = useState(false);
  // The bank a switch was started FOR, so the mode screen it was meant
  // to reach opens by itself when the rebuild lands. A failed job leaves
  // the old bank active, so this simply never fires and the candidate is
  // left where they can try again — no error path of its own.
  //
  // A ref, not state: it is never rendered and must never cause a
  // render. What the effect below waits on is `active` changing, which
  // is the catalog refetch App triggers when the job finishes.
  const pendingMode = useRef<string | null>(null);

  const banksState = useAsync((signal) => getBanks(signal), [catalogVersion]);
  const active = banksState.data?.active;

  useEffect(() => {
    if (banksState.data) onBanksLoaded(banksState.data);
  }, [banksState.data, onBanksLoaded]);

  useEffect(() => {
    if (!pendingMode.current || active !== pendingMode.current) return;
    const target = pendingMode.current;
    pendingMode.current = null;
    navigate(`/exams/${target}/mode`);
  }, [active]);

  const chooseMode = (bank: BankEntry) => {
    if (bank.id === active) {
      navigate(`/exams/${bank.id}/mode`);
      return;
    }
    setConfirm(bank);
  };

  // The dialog's own concerns (close on acceptance, release the disabled
  // state either way) live inside the starter; whether the candidate
  // hears about a failure is App's, through the wrapper it already owns.
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
        state={banksState}
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
        {(banks) => {
          const live = banks.banks.filter((b) => b.available);
          const soon = banks.banks.filter((b) => !b.available);
          return (
            <>
              <header className="page-head">
                <div>
                  <h1>{strings.exams.title}</h1>
                  <p className="page-lead">{strings.exams.lead}</p>
                </div>
                {banks.banks.length > 0 && (
                  <div className="coverage">
                    <div className="coverage-figure">
                      <span className="coverage-label">{strings.exams.coverageLabel}</span>
                      <span className="coverage-value">
                        {strings.exams.coverage(live.length, banks.banks.length)}
                      </span>
                    </div>
                    {/* One segment per card below, tinted like its card.
                        Decorative: the figure beside it already says the
                        same thing in words, and empty list items announce
                        as nothing at all. In a later milestone the fill
                        rule becomes pass state; the five segments are the
                        same five exams either way. */}
                    <span className="coverage-bar" aria-hidden="true">
                      {banks.banks.map((b) => (
                        <span key={b.id} data-engine={engineTint(b)} />
                      ))}
                    </span>
                  </div>
                )}
              </header>

              {banks.banks.length === 0 && <p className="page-empty">{strings.exams.empty}</p>}

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
                    <SoonCard key={b.id} bank={b} />
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
          title={strings.lobby.switchConfirmTitle(examHeading(confirm))}
          onClose={() => setConfirm(null)}
        >
          <p>{strings.lobby.switchConfirmBody}</p>
          <div className="confirm-actions">
            <button className="btn" onClick={() => setConfirm(null)} disabled={switching}>
              {strings.lobby.cancel}
            </button>
            <button className="btn btn-primary" onClick={handleConfirm} disabled={switching}>
              {/* Both buttons going grey with nothing else changing reads
                  as a stuck dialog rather than a request in flight. */}
              {switching ? strings.control.starting : strings.lobby.switchConfirm}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
