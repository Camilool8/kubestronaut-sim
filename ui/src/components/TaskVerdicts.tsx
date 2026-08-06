import { useState, useSyncExternalStore } from "react";
import { type QuestionResult } from "../api";
import { CheckList } from "./CheckList";
import { Icon } from "./Icon";
import { marksStore } from "./marksStore";
import { McqAnswerReview } from "./McqAnswerReview";
import { verdictOf, type Verdict } from "./resultsModel";
import { formatDuration, formatElapsed } from "../lib/format";
import { strings } from "../strings";

type Filter = "all" | "failed" | "partial" | "flagged";

interface Row {
  question: QuestionResult;

  n: number;
  verdict: Verdict;
  flagged: boolean;
}

export function TaskVerdicts({
  questions,
  basePath = "/results",
}: {
  questions: QuestionResult[];

  basePath?: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  useSyncExternalStore(marksStore.subscribe, marksStore.getVersion);

  const rows: Row[] = questions.map((question, i) => ({
    question,
    n: i + 1,
    verdict: verdictOf(question.verdict, question.earned, question.total),
    flagged: marksStore.isMarked(question.id),
  }));

  const counts = {
    all: rows.length,
    failed: rows.filter((r) => r.verdict === "failed").length,
    partial: rows.filter((r) => r.verdict === "partial").length,
    flagged: rows.filter((r) => r.flagged).length,
  };

  const weighted = rows.some((r) => r.question.weightPct !== undefined);
  const timed = rows.some((r) => r.question.timeSpentSeconds !== undefined);

  const visible = rows.filter((r) =>
    filter === "all"
      ? true
      : filter === "flagged"
        ? r.flagged
        : r.verdict === filter,
  );

  const classes = ["verdict-table"];
  if (weighted) classes.push("has-weight");
  if (timed) classes.push("has-time");

  return (
    <section className="task-verdicts">
      <div className="task-verdicts-head">
        <h2>{strings.score.verdictsTitle}</h2>

        <div className="tv-filters" role="group" aria-label={strings.score.filterLabel}>
          <Chip on={filter === "all"} count={counts.all} onPick={() => setFilter("all")}>
            {strings.score.filterAll}
          </Chip>
          {counts.failed > 0 && (
            <Chip
              on={filter === "failed"}
              count={counts.failed}
              onPick={() => setFilter("failed")}
            >
              {strings.score.filterFailed}
            </Chip>
          )}
          {counts.partial > 0 && (
            <Chip
              on={filter === "partial"}
              count={counts.partial}
              onPick={() => setFilter("partial")}
            >
              {strings.score.filterPartial}
            </Chip>
          )}
          {counts.flagged > 0 && (
            <Chip
              on={filter === "flagged"}
              count={counts.flagged}
              onPick={() => setFilter("flagged")}
            >

              <Icon name="flag" />
              <span className="sr-only">{strings.score.filterFlagged}</span>
            </Chip>
          )}
        </div>
      </div>

      <div className={classes.join(" ")}>

        <div className="tv-head" aria-hidden="true">
          <span>{strings.score.colNum}</span>
          <span>{strings.score.colTask}</span>

          {weighted && <span className="tv-head-figure">{strings.score.colWeight}</span>}
          {timed && <span className="tv-head-figure">{strings.score.colTime}</span>}
          <span>{strings.score.colVerdict}</span>
        </div>
        {visible.map((row) => (
          <TaskRow
            key={row.question.id}
            row={row}
            weighted={weighted}
            timed={timed}
            basePath={basePath}
          />
        ))}
        {visible.length === 0 && <p className="tv-empty">{strings.score.filterEmpty}</p>}
      </div>
      <p className="tv-hint">{strings.score.verdictsHint}</p>
    </section>
  );
}

interface ChipProps {
  on: boolean;
  count: number;
  onPick: () => void;
  children: React.ReactNode;
}

function Chip({ on, count, onPick, children }: ChipProps) {
  return (
    <button type="button" className="tv-chip" aria-pressed={on} onClick={onPick}>
      {children} <span className="tv-chip-count">{count}</span>
    </button>
  );
}

export const VERDICT_WORD: Record<Verdict, string> = {
  correct: strings.score.verdictCorrect,
  partial: strings.score.verdictPartial,
  failed: strings.score.verdictFailed,
};

function TaskRow({
  row,
  weighted,
  timed,
  basePath,
}: {
  row: Row;
  weighted: boolean;
  timed: boolean;
  basePath: string;
}) {
  const { question, n, verdict, flagged } = row;

  const isMcq = question.options !== undefined;

  const name = question.title || (isMcq ? strings.mcq.questionNumber(n) : question.id);
  const trailingId = !isMcq && question.title ? question.id : null;

  return (
    <details className={`question-result tv-row is-${verdict}`}>
      <summary>
        <span className="tv-num">
          <Icon name="chevron-down" className="disclosure-chevron" />
          {n}
        </span>
        <span className="tv-task">
          <span className="tv-task-name">{name}</span>
          {flagged && (
            <>
              <Icon name="flag-filled" className="tv-flag" />
              <span className="sr-only">{strings.score.filterFlagged}</span>
            </>
          )}

          {(trailingId || question.domain) && (
            <span className="tv-task-meta">
              {trailingId && (
                <>
                  <span className="tv-task-id">{trailingId}</span>
                  {question.domain ? strings.score.metaSeparator : null}
                </>
              )}
              {question.domain}
            </span>
          )}
        </span>
        {weighted && (
          <span className="tv-weight">
            <span className="sr-only">{strings.score.srWeight}: </span>
            {question.weightPct === undefined
              ? strings.score.notRecorded
              : strings.score.percentValue(Math.round(question.weightPct))}
          </span>
        )}
        {timed && <TimeCell question={question} />}
        <span className={`tv-verdict is-${verdict}`}>
          {VERDICT_WORD[verdict]}
          <span className="tv-points">
            {question.earned}/{question.total}
          </span>
        </span>
      </summary>

      <div className="tv-detail">
        {isMcq ? <McqAnswerReview question={question} /> : <CheckList checks={question.checks} />}

        <p className="tv-more">
          <a className="tv-open" href={`#${basePath}/${question.id}`}>
            {strings.score.openExplain(n)}
            <Icon name="chevron-right" />
          </a>
        </p>
      </div>
    </details>
  );
}

function TimeCell({ question }: { question: QuestionResult }) {
  const spent = question.timeSpentSeconds;
  if (spent === undefined) {
    return (
      <span className="tv-time">
        <span aria-hidden="true">{strings.score.notRecorded}</span>
        <span className="sr-only">
          {strings.score.srTime}: {strings.score.notRecordedLabel}
        </span>
      </span>
    );
  }

  const target = question.targetSeconds;
  const over = target !== undefined && target > 0 && spent > target ? spent - target : 0;
  return (
    <span className={over > 0 ? "tv-time is-over" : "tv-time"}>
      <span className="sr-only">{strings.score.srTime}: </span>
      {formatElapsed(spent * 1000)}
      {over > 0 && target !== undefined && (
        <>
          <span className="tv-over" aria-hidden="true">
            {strings.score.overTarget(formatElapsed(over * 1000))}
          </span>

          <span className="sr-only">
            {" "}
            {strings.score.srOverTarget(formatElapsed(over * 1000), formatDuration(target))}
          </span>
        </>
      )}
    </span>
  );
}
