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
 * It holds an original mark per certification (see CertMark), not the
 * acronym: the acronym is already the heading beside it, so setting it
 * twice spent the one memorable slot on the card saying nothing new.
 *
 * The acronym survives as the fallback for a certification nobody has
 * drawn a mark for yet — `banks/catalog.yaml` can advertise one at any
 * time, and a tile that renders empty is worse than a plain one. That is
 * why the mono type rules stay on `.exam-avatar`.
 */
function ExamAvatar({ bank }: { bank: BankEntry }) {
  if (!bank.certification) return null;
  return (
    <span className="exam-avatar" aria-hidden="true">
      <CertMark certification={bank.certification} />
      {!hasCertMark(bank.certification) && bank.certification}
    </span>
  );
}

/**
 * How this exam has actually gone, in the slot the bank's pitch holds
 * until there is something to put there.
 *
 * `bestPercent` and `passed` come from COUNTED attempts only — a
 * domain-filtered or short draw is real practice and is kept, but it is
 * not a sitting, so it can never fill this bar (see `AttemptRecord.counted`
 * in api.ts). That is also why the label has a third reading: an exam whose
 * every attempt was a drill would otherwise print a count beside a dash.
 */
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
      {/* Decorative: the figure directly above it is the same number, so
          the card reads identically with CSS off. A card with no counted
          attempt still draws the empty track — the row keeps its height,
          and an absent bar would be a fourth thing to interpret. */}
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

        {/* The brief's best-attempt bar, once there is one to draw. Before
            the first attempt the same slot holds the bank's own one-line
            pitch — which was previously buried in a title= tooltip — so
            the card never has a hole in it and never shows a number the
            product cannot know. */}
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
        {/* The reason is the entire point of rendering an exam nobody can
            sit, so it is never dimmed and never truncated. */}
        {bank.note && <p className="exam-note">{bank.note}</p>}
      </article>
    </li>
  );
}

/**
 * The seat a hosted candidate is sitting in, or undefined when this is
 * the local product and every exam is theirs to choose.
 *
 * A hosted seat is ONE EXAM. The candidate chose the certification in
 * the lobby and their Pod was created, stamped and sized for it, so
 * every other exam is greyed out here and the hub refuses it too. That
 * refusal is the one that matters; this is so nobody is offered it
 * first, and so the reason is on screen rather than in a 409.
 *
 * The catalog cannot make this distinction itself — the banks image
 * stages every bank into every session, so all of them are `available`
 * from inside any Pod.
 *
 * `seatBank` is empty for a session adopted from a Pod created before
 * exams were choosable. Those fall back to the rule that came first: the
 * seat's FLAVOUR. A multiple-choice Pod is a facilitator and 128Mi with
 * no cluster in it, so a hands-on exam started there boots the bank into
 * an environment with no instances and no desktop — every task grades
 * zero against "could not resolve hostname instance-1", and the attempt
 * is recorded as if it counted.
 */
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
      // Not "coming soon": it exists, it is finished, and someone in the
      // other seat is sitting it right now.
      comingSoon: false,
      note: strings.exams.wrongSeatNote(
        needs === "mcq" ? strings.exams.engineMcq : strings.exams.enginePractical,
      ),
    };
  });
  return { offered, wrongSeat };
}

/**
 * The same treatment for a fact about the DEVICE rather than the seat.
 *
 * Composed after seatFor rather than folded into it: one answers "does
 * this environment have a cluster in it", the other "does the person
 * looking at this have a keyboard", and they are true independently. A
 * card already refused by the seat keeps that reason — it is the one the
 * candidate can act on without finding another computer.
 *
 * Choosing a hands-on exam here is not a navigation. It is a two-to-four
 * minute destructive rebuild of the cluster, and on a phone it ends at a
 * screen explaining that the exam it just built cannot be sat. The cost
 * is why this is refused at the card rather than at the mode screen.
 */
function deviceFor(exams: CatalogExam[], blocked: boolean): CatalogExam[] {
  if (!blocked) return exams;
  return exams.map((bank) => {
    if (!bank.available || bank.examType === "mcq") return bank;
    return {
      ...bank,
      available: false,
      // Not "coming soon", for the same reason the wrong-seat rows are
      // not: it exists, it is finished, and the only thing missing is
      // in front of the screen rather than behind it.
      comingSoon: false,
      note: strings.mobile.catalogNote,
    };
  });
}

interface ExamsProps {
  // Bumped by App whenever a control job finishes: a completed switch
  // changes which bank is active while this screen stays mounted.
  catalogVersion: number;
  // The hosted seat, if this is a hosted session. Undefined locally.
  seatKind?: SessionKind;
  // The one exam that seat was created for. Undefined locally, and
  // undefined for a session adopted from before exams were choosable.
  seatBank?: string;
  // Takes the *starter*, not its result, so the switch runs inside App's
  // runControlAction — the wrapper that turns both a refused job
  // ({ok:false}) and a rejected fetch into a toast.
  onControlStart: (start: () => Promise<ControlActionResponse>) => void;
  // Lifts the catalog to App, which needs it to name the exam a switch
  // targets and to fill the mode screen's header. Reported from here
  // rather than refetched so there is one request.
  //
  // Still shaped as a BanksResponse: `CatalogExam extends BankEntry`, so
  // the joined rows satisfy it as they are, and App wants the bank fields
  // and nothing else. Widening its prop to carry progress it does not read
  // would be a change to App for this screen's convenience.
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
 *
 * A fresh environment has no active bank at all: nothing is built until
 * an exam is chosen, and this screen is where that happens. The
 * confirmation still appears — it is still minutes of building — but it
 * describes a build rather than a switch, because there is no outgoing
 * exam and no candidate work for it to destroy.
 */
export function Exams({
  catalogVersion,
  seatKind,
  seatBank,
  onControlStart,
  onBanksLoaded,
}: ExamsProps) {
  const [confirm, setConfirm] = useState<CatalogExam | null>(null);
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

  // The catalog is worth reading on a phone — past scores, what each
  // exam asks, how far along the path you are. Starting a hands-on one
  // is not, and the button that does it costs minutes of rebuilding to
  // find out.
  const blocked = useDesktopGate() === "blocked";

  // GET /api/catalog, not GET /api/control/banks: the same bank fields,
  // joined to attempt history and served by the facilitator rather than
  // the conductor. That split is deliberate on the server side — LOOKING
  // at the exam list must never be able to trigger a rebuild — and it is
  // what lets this screen show how each exam has gone.
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
          // Only the two lists below are seat-aware. The coverage figure
          // above counts certifications passed on the path, which is a
          // fact about the candidate and not about the Pod they are in.
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
                    {/* One segment per card below, now carrying PASS state
                        rather than the engine hue: the figure beside it
                        counts passes, and a bar counting something else
                        would be two readings of one capsule. Decorative —
                        the figure says the same thing in words, and empty
                        list items announce as nothing at all. */}
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
          {/* `active` is empty exactly when no exam has ever been chosen
              in this environment — nothing is built, so there is nothing
              to wipe and nothing being replaced. The switch copy is a
              warning about losing state; printing it here would warn a
              candidate about work they have not done. */}
          <p>{active ? strings.lobby.switchConfirmBody : strings.lobby.buildConfirmBody}</p>
          <div className="confirm-actions">
            <button className="btn" onClick={() => setConfirm(null)} disabled={switching}>
              {strings.lobby.cancel}
            </button>
            <button className="btn btn-primary" onClick={handleConfirm} disabled={switching}>
              {/* Both buttons going grey with nothing else changing reads
                  as a stuck dialog rather than a request in flight. */}
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
