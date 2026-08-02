import { useRef, useState } from "react";
import {
  deleteHistory,
  getCatalog,
  getExam,
  getHistory,
  historyExportURL,
  importHistory,
  type AttemptRecord,
  type CatalogExam,
  type CatalogResponse,
  type ExamInfo,
  type HistoryResponse,
} from "../api";
import { Async } from "../components/Async";
import { Dialog } from "../components/Dialog";
import { drillHref, formatAttemptDate, pathStatus } from "../lib/attemptHistory";
import { formatElapsed } from "../lib/format";
import { navigate } from "../lib/useHashRoute";
import { useAsync } from "../lib/useAsync";
import { strings } from "../strings";

interface ProgressProps {
  /**
   * Bumped by App whenever a control job finishes. A completed switch
   * changes which bank is loaded, and that decides whether the weak-domain
   * panel's drill button can do anything at all.
   */
  catalogVersion: number;
}

/** Everything one render of this screen needs, fetched together. */
interface Dashboard {
  catalog: CatalogResponse;
  history: HistoryResponse;
  /**
   * The LOADED bank's curriculum, or null when /api/exam did not answer.
   *
   * Only the drill button reads it, and it is the one of the three calls
   * that can legitimately fail while the rest of the screen is perfectly
   * good — during a cold cluster boot the facilitator answers for history
   * and not yet for the exam. So a failure here costs one button rather
   * than replacing the dashboard with an error card.
   */
  exam: ExamInfo | null;
}

/** How many weak domains the panel ranks. See where it is applied. */
const WEAK_SHOWN = 6;

const STATUS_LABEL = {
  passed: strings.progress.statusPassed,
  attempted: strings.progress.statusAttempted,
  untouched: strings.progress.statusUntouched,
  soon: strings.progress.statusSoon,
};

/** The heading on a path card: the certification, else the bank's title. */
function examHeading(exam: CatalogExam): string {
  return exam.certification || exam.title;
}

/**
 * One certification's standing.
 *
 * The figure and the bar are fed by `bestPercent`, which the server
 * derives from COUNTED attempts only — a domain drill cannot light up a
 * path card however well it went (`AttemptRecord.counted`). The meta line
 * has a third reading for exactly that case: "3 attempts" beside a dash
 * would read as a bug rather than as a week of drilling.
 */
function PathCard({ exam }: { exam: CatalogExam }) {
  const status = pathStatus(exam);
  const { attempts, counted, bestPercent, lastAttemptAt } = exam.progress;
  // A record always carries the timestamp it was graded at, so a missing
  // one means an attempt from before the field existed. The dash keeps the
  // count truthful rather than dropping the whole line for it.
  const last = lastAttemptAt ? formatAttemptDate(lastAttemptAt) : strings.progress.noScore;
  const meta =
    attempts === 0
      ? strings.progress.cardMetaNone
      : counted === 0
        ? strings.progress.cardMetaDrills(attempts)
        : strings.progress.cardMeta(attempts, last);

  return (
    <li>
      <article className="path-card" data-status={status}>
        <div className="path-card-head">
          <span className="path-card-id">{examHeading(exam)}</span>
          {/* The word is the channel; the card's tint is the second
              signal. A passed card and a not-started one must never
              differ by hue alone. */}
          <span className="path-badge">{STATUS_LABEL[status]}</span>
        </div>
        <p className="path-card-score">
          {/* The card draws a bare number under an acronym, which is
              legible on screen and says nothing at all read aloud. */}
          <span className="sr-only">{strings.progress.cardScoreLabel}: </span>
          {bestPercent === undefined
            ? strings.progress.noScore
            : strings.progress.percent(Math.round(bestPercent))}
        </p>
        {/* Decorative: the figure directly above it is the same number. */}
        <span className="path-bar" aria-hidden="true">
          <span className="path-bar-fill" style={{ width: `${bestPercent ?? 0}%` }} />
        </span>
        <span className="path-card-meta">{meta}</span>
      </article>
    </li>
  );
}

/** How the attempt was run, and what it was run over. */
function modeCell(record: AttemptRecord): string {
  const mode = record.mode === "" ? undefined : strings.modes[record.mode];
  const label = mode ? mode.label : record.mode;
  return record.domainFilter && record.domainFilter.length > 0
    ? strings.progress.modeDomains(
        label,
        record.domainFilter.join(strings.progress.domainSeparator),
      )
    : strings.progress.modeAllDomains(label);
}

/**
 * How long the attempt ran.
 *
 * Elapsed time, not the clock it was given: a training run has no clock
 * and still took an hour, and an exam submitted early did not use two
 * hours. A record with no elapsed figure at all predates the field, which
 * is not the same thing as an untimed run.
 */
function timeCell(record: AttemptRecord): string {
  if (record.elapsedSeconds) return formatElapsed(record.elapsedSeconds * 1000);
  return record.durationSeconds ? strings.progress.noScore : strings.progress.untimed;
}

export function Progress({ catalogVersion }: ProgressProps) {
  const [erasing, setErasing] = useState(false);
  // Which destructive/slow action is in flight, so every other one is
  // held rather than racing it. One value, not one flag each: two of
  // these can never usefully run at once.
  const [busy, setBusy] = useState<"import" | "erase" | null>(null);
  // The outcome of the last import or erase. A `role="status"` line
  // rather than a toast: it reports a change to the very list underneath
  // it, and it should be readable next to what changed.
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);

  const state = useAsync<Dashboard>(
    async (signal) => {
      const [catalog, history, exam] = await Promise.all([
        getCatalog(signal),
        getHistory(signal),
        getExam(signal).catch(() => null),
      ]);
      return { catalog, history, exam };
    },
    [catalogVersion],
  );

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy("import");
    setNotice(null);
    try {
      const result = await importHistory(await file.text());
      if (result.ok) {
        setNotice({
          ok: true,
          text: strings.progress.importDone(result.imported, result.skipped),
        });
        state.reload();
      } else {
        setNotice({ ok: false, text: strings.progress.importFailed(result.error) });
      }
    } catch (err) {
      // A file the browser could not read, or a document the server
      // rejected before answering JSON. Both land here and both are the
      // candidate's file, so the message names the file rather than the
      // server.
      setNotice({ ok: false, text: strings.progress.importFailed(String(err)) });
    } finally {
      setBusy(null);
      // Cleared so choosing the SAME file again still fires a change
      // event. Without it a failed import cannot be retried by repeating
      // the exact gesture that failed.
      if (filePicker.current) filePicker.current.value = "";
    }
  };

  const handleErase = async () => {
    setBusy("erase");
    setNotice(null);
    try {
      const result = await deleteHistory();
      if (result.ok) {
        setErasing(false);
        setNotice({ ok: true, text: strings.progress.eraseDone });
        state.reload();
      } else {
        setNotice({ ok: false, text: strings.progress.eraseFailed(result.error) });
      }
    } catch (err) {
      setNotice({ ok: false, text: strings.progress.eraseFailed(String(err)) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page progress-screen">
      <header className="page-head">
        <div>
          <h1>{strings.progress.title}</h1>
          <p className="page-lead">{strings.progress.lead}</p>
        </div>
        <div className="progress-actions">
          {/* A link, not a fetch: the browser saves the document under the
              filename the server names it, and no blob is built in memory
              to do it. */}
          <a className="btn" href={historyExportURL} download title={strings.progress.exportHint}>
            {strings.progress.export}
          </a>
          {/* The button is the control; the input is the mechanism. A file
              picker is the only way a browser can hand a document back,
              and an export with no way in would be a one-way door — but
              the visible vocabulary of this screen stays buttons. */}
          <button
            type="button"
            className="btn"
            onClick={() => filePicker.current?.click()}
            disabled={busy !== null}
            title={strings.progress.importHint}
          >
            {busy === "import" ? strings.progress.importBusy : strings.progress.import}
          </button>
          <input
            ref={filePicker}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            aria-label={strings.progress.importPick}
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => setErasing(true)}
            disabled={busy !== null}
          >
            {strings.progress.erase}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => navigate("/exams")}>
            {strings.progress.newSession}
          </button>
        </div>
      </header>

      {notice && (
        <p className="progress-notice" role={notice.ok ? "status" : "alert"}>
          {notice.text}
        </p>
      )}

      <Async
        state={state}
        loading={<p className="page-loading">{strings.app.working}</p>}
        error={(message, reload) => (
          <div className="catalog-error" role="alert">
            <p className="catalog-error-body">{strings.progress.loadFailed(message)}</p>
            <button type="button" className="btn" onClick={reload}>
              {strings.progress.retry}
            </button>
          </div>
        )}
      >
        {({ catalog, history, exam }) => {
          const attempts = history.attempts;
          // Capped, and the cap is the point. The rollup spans every
          // certification the candidate has attempted, so with two exams
          // in the record it returned nine rows — every domain either bank
          // has, in order. A list of everything ranked worst-first is not a
          // priority; it is the same information the domain breakdown
          // already gives, sorted. Six is what fits beside the attempt
          // table without scrolling, and "weakest" only means anything
          // while the list is short enough to act on.
          const weak = history.summary.weakDomains.slice(0, WEAK_SHOWN);
          // Which of those this environment could actually draw. Only one
          // bank is loaded at a time, so a weak domain belonging to another
          // certification cannot be drilled from here whatever the rollup
          // says — and a button that started a run over domains the loaded
          // bank has never heard of would draw nothing at all.
          const curriculum = new Set((exam?.domains ?? []).map((d) => d.name));
          const drillable = weak.map((w) => w.domain).filter((d) => curriculum.has(d));
          // Whether "these" covers the whole visible list. When it does
          // not, the button has to say so: the rows it will skip are on
          // screen, directly above it.
          const partial = drillable.length > 0 && drillable.length < weak.length;
          const activeExam = catalog.exams.find((e) => e.id === catalog.active);

          return (
            <>
              <ul className="path-cards" aria-label={strings.progress.pathLabel}>
                {catalog.exams.map((e) => (
                  <PathCard key={e.id} exam={e} />
                ))}
              </ul>

              <div className="progress-body">
                <section className="history-panel">
                  <h2>{strings.progress.historyTitle}</h2>
                  {attempts.length === 0 ? (
                    <p className="page-empty">{strings.progress.historyEmpty}</p>
                  ) : (
                    <>
                      {/* Scroll-Inside: five columns of mono do not
                          compress, so the wrapper takes the overflow and
                          the page never scrolls sideways. */}
                      <div className="history-scroll">
                        <table className="history-table">
                          <thead>
                            <tr>
                              <th scope="col">{strings.progress.colExam}</th>
                              <th scope="col">{strings.progress.colMode}</th>
                              <th scope="col">{strings.progress.colDate}</th>
                              <th scope="col">{strings.progress.colTime}</th>
                              <th scope="col" className="history-score">
                                {strings.progress.colScore}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {attempts.map((a) => (
                              <tr key={a.id}>
                                <th scope="row" className="history-exam">
                                  {a.certification || a.examTitle || a.bank}
                                </th>
                                <td className="history-mode">{modeCell(a)}</td>
                                <td className="history-date">{formatAttemptDate(a.gradedAt)}</td>
                                <td className="history-time">{timeCell(a)}</td>
                                <td className="history-score">
                                  <span className="history-figure">
                                    {strings.progress.percent(Math.round(a.percent))}
                                  </span>
                                  {/* The word carries the state; the tint
                                      repeats it. An uncounted row keeps
                                      its score — it is real evidence about
                                      those domains — and says what it is
                                      instead of being hidden. */}
                                  <span
                                    className="history-mark"
                                    data-verdict={
                                      !a.counted ? "drill" : a.passed ? "pass" : "fail"
                                    }
                                  >
                                    {!a.counted
                                      ? strings.progress.uncounted
                                      : a.passed
                                        ? strings.progress.rowPassed
                                        : strings.progress.rowFailed}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {attempts.some((a) => !a.counted) && (
                        <p className="history-footnote">{strings.progress.uncountedTitle}</p>
                      )}
                    </>
                  )}
                </section>

                <section className="weak-panel">
                  <h2>{strings.progress.weakTitle}</h2>
                  {/* `DomainSummary.attempts` counts EVERY graded attempt
                      including drills, and the hint says so: a rollup that
                      ignored drills would keep reporting the weakness the
                      candidate spent all week fixing. */}
                  <p className="weak-hint">{strings.progress.weakHint}</p>
                  {weak.length === 0 ? (
                    <p className="page-empty">{strings.progress.weakEmpty}</p>
                  ) : (
                    <ul className="weak-rows">
                      {weak.map((w) => (
                        <li key={w.domain} className="weak-row">
                          <div className="weak-row-head">
                            <span className="weak-name">{w.domain}</span>
                            <span className="weak-figure">
                              {strings.progress.percent(Math.round(w.percent))}
                            </span>
                          </div>
                          <span className="weak-bar" aria-hidden="true">
                            <span className="weak-bar-fill" style={{ width: `${w.percent}%` }} />
                          </span>
                          {/* One weak run is not a trend, so the count
                              travels with the percentage — and, when the
                              drill below would skip this row, so does the
                              reason. Marked on the row rather than only
                              summarised on the button, because "which of
                              these" is a question about the rows. */}
                          <span className="weak-meta">
                            {strings.progress.weakMeta(w.attempts)}
                            {partial && !curriculum.has(w.domain) && (
                              <span className="weak-elsewhere">
                                {strings.progress.weakNotHere}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* Offered only when it can do something. With no exam
                      loaded at all — /api/exam did not answer — neither
                      branch is honest: the button would not work and the
                      note would tell the candidate to load a bank that is
                      already loaded. */}
                  {weak.length > 0 && drillable.length > 0 && (
                    <button
                      type="button"
                      className="btn weak-drill"
                      onClick={() => navigate(drillHref(catalog.active, drillable))}
                    >
                      {partial ? strings.progress.drillSome(drillable.length) : strings.progress.drill}
                    </button>
                  )}
                  {weak.length > 0 && drillable.length === 0 && exam !== null && activeExam && (
                    <p className="weak-unavailable">
                      {strings.progress.drillUnavailable(examHeading(activeExam))}
                    </p>
                  )}
                </section>
              </div>
            </>
          );
        }}
      </Async>

      {erasing && (
        <Dialog title={strings.progress.eraseConfirmTitle} onClose={() => setErasing(false)}>
          <p>{strings.progress.eraseConfirmBody}</p>
          <div className="confirm-actions">
            <button
              type="button"
              className="btn"
              onClick={() => setErasing(false)}
              disabled={busy === "erase"}
            >
              {strings.lobby.cancel}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void handleErase()}
              disabled={busy === "erase"}
            >
              {/* Both buttons going grey with nothing else changing reads
                  as a stuck dialog rather than a request in flight. */}
              {busy === "erase" ? strings.progress.eraseBusy : strings.progress.eraseConfirm}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
