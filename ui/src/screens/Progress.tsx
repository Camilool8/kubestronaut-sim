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
  catalogVersion: number;

  hosted?: boolean;
}

interface Dashboard {
  catalog: CatalogResponse | null;
  history: HistoryResponse;

  exam: ExamInfo | null;
}

const WEAK_SHOWN = 6;

const STATUS_LABEL = {
  passed: strings.progress.statusPassed,
  attempted: strings.progress.statusAttempted,
  untouched: strings.progress.statusUntouched,
  soon: strings.progress.statusSoon,
};

function examHeading(exam: CatalogExam): string {
  return exam.certification || exam.title;
}

function PathCard({ exam }: { exam: CatalogExam }) {
  const status = pathStatus(exam);
  const { attempts, counted, bestPercent, lastAttemptAt } = exam.progress;

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

          <span className="path-badge">{STATUS_LABEL[status]}</span>
        </div>
        <p className="path-card-score">

          <span className="sr-only">{strings.progress.cardScoreLabel}: </span>
          {bestPercent === undefined
            ? strings.progress.noScore
            : strings.progress.percent(Math.round(bestPercent))}
        </p>

        <span className="path-bar" aria-hidden="true">
          <span className="path-bar-fill" style={{ width: `${bestPercent ?? 0}%` }} />
        </span>
        <span className="path-card-meta">{meta}</span>
      </article>
    </li>
  );
}

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

function timeCell(record: AttemptRecord): string {
  if (record.elapsedSeconds) return formatElapsed(record.elapsedSeconds * 1000);
  return record.durationSeconds ? strings.progress.noScore : strings.progress.untimed;
}

export function Progress({ catalogVersion, hosted = false }: ProgressProps) {
  const [erasing, setErasing] = useState(false);

  const [busy, setBusy] = useState<"import" | "erase" | null>(null);

  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);

  const state = useAsync<Dashboard>(
    async (signal) => {
      const [catalog, history, exam] = await Promise.all([
        getCatalog(signal).catch(() => null),
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
      setNotice({ ok: false, text: strings.progress.importFailed(String(err)) });
    } finally {
      setBusy(null);

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
          <p className="page-lead">
            {hosted ? strings.progress.leadHosted : strings.progress.lead}
          </p>
        </div>
        <div className="progress-actions">

          <a className="btn" href={historyExportURL} download title={strings.progress.exportHint}>
            {strings.progress.export}
          </a>

          {!hosted && (
            <>
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
            </>
          )}
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

          const weak = history.summary.weakDomains.slice(0, WEAK_SHOWN);

          const curriculum = new Set((exam?.domains ?? []).map((d) => d.name));
          const drillable =
            catalog === null ? [] : weak.map((w) => w.domain).filter((d) => curriculum.has(d));

          const partial = drillable.length > 0 && drillable.length < weak.length;
          const activeExam = catalog?.exams.find((e) => e.id === catalog.active);

          return (
            <>

              {catalog && (
                <ul className="path-cards" aria-label={strings.progress.pathLabel}>
                  {catalog.exams.map((e) => (
                    <PathCard key={e.id} exam={e} />
                  ))}
                </ul>
              )}

              <div className="progress-body">
                <section className="history-panel">
                  <h2>{strings.progress.historyTitle}</h2>
                  {attempts.length === 0 ? (
                    <p className="page-empty">{strings.progress.historyEmpty}</p>
                  ) : (
                    <>

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

                                  {hosted ? (
                                    <a
                                      className="history-open"
                                      href={`#/history/${a.id}`}
                                      aria-label={strings.progress.reviewRow(
                                        a.certification || a.examTitle || a.bank,
                                        formatAttemptDate(a.gradedAt),
                                      )}
                                    >
                                      {a.certification || a.examTitle || a.bank}
                                    </a>
                                  ) : (
                                    (a.certification || a.examTitle || a.bank)
                                  )}
                                </th>
                                <td className="history-mode">{modeCell(a)}</td>
                                <td className="history-date">{formatAttemptDate(a.gradedAt)}</td>
                                <td className="history-time">{timeCell(a)}</td>
                                <td className="history-score">
                                  <span className="history-figure">
                                    {strings.progress.percent(Math.round(a.percent))}
                                  </span>

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

                  {weak.length > 0 && drillable.length > 0 && (
                    <button
                      type="button"
                      className="btn weak-drill"
                      onClick={() => catalog && navigate(drillHref(catalog.active, drillable))}
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

              {busy === "erase" ? strings.progress.eraseBusy : strings.progress.eraseConfirm}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
