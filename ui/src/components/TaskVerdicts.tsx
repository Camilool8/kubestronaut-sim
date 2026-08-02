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
  /** The candidate's own sequence position, which is what they counted. */
  n: number;
  verdict: Verdict;
  flagged: boolean;
}

/**
 * Every graded task in one strip: number, task, weight, time and verdict,
 * filtered by what went wrong.
 *
 * Two surfaces, two jobs, and that division decides everything below.
 * This table is a SCANNING surface — twenty rows read against each other
 * — and screens/Explain.tsx is a READING surface for one task.
 *
 * A row is a disclosure because of the scanning job: a candidate
 * comparing why check 2 failed on three tasks should not have to make
 * three navigations and lose the table each time, so the grader's checks
 * (for mcq, the answer review) open in place. What a row no longer
 * discloses is the reference solution. It used to, and the deep dive
 * renders the same solution eagerly, so an opened row and the screen it
 * links to said the same thing twice — the second time in a column
 * narrow enough that a fenced block scrolled sideways. A solution is
 * prose, YAML and commands; it belongs to the surface built for reading.
 *
 * So an opened row is its checks and one way out. The link is drawn
 * AFTER the checks now: it led the disclosure only because a link buried
 * under a check list and a solution disclosure is a link nobody finds,
 * and with the solution gone the row reads in its natural order — you
 * opened it for the checks, and the link is the step after them. It
 * stays inside the disclosure rather than on the row itself because a
 * <summary> is an interactive element: an <a> inside one is nested
 * interactive content, which is both an axe violation and a genuinely
 * ambiguous click target.
 *
 * The domain is not a column either. It had one, 150px wide, and not one
 * name in this bank fits it — "Application Environment, Configuration
 * and Security" is fifty characters, and it wrapped to three lines in
 * that column while the title beside it was being cut to an ellipsis. It
 * rides the task's own meta line now, in full, and the title gets the
 * width back.
 *
 * It is deliberately NOT a <table>: a row has to be a <details> to
 * disclose its checks, and a <details> cannot be a <tr>. The visible
 * column strip is therefore aria-hidden decoration and every cell that
 * would be ambiguous alone carries its own name instead.
 */
export function TaskVerdicts({ questions }: { questions: QuestionResult[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  // The flags are the candidate's own, from the attempt that just ended.
  // Subscribing to the version counter rather than the sets themselves:
  // useSyncExternalStore needs a snapshot whose identity is stable
  // between notifications, and a mutable Set is not that.
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

  // A column appears only when at least one row can fill it. Both of
  // these arrive on new results and on no old one, and a column of
  // dashes costs width to say nothing. Mixed rows still get a dash,
  // because there the absence is about that task and not about the
  // whole result.
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
        {/* Only the filters that would find something are drawn. A chip
            reading "Failed 0" is a control whose only outcome is an empty
            list, and this screen has enough to say without one. */}
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
              {/* The flag is drawn, not typed. @fontsource declares a
                  unicode-range per @font-face and ⚑ is outside every one
                  of them, so the codepoint would never reach the woff2. */}
              <Icon name="flag" />
              <span className="sr-only">{strings.score.filterFlagged}</span>
            </Chip>
          )}
        </div>
      </div>

      <div className={classes.join(" ")}>
        {/* Labels for the sighted reader only: nothing here associates a
            header with a cell, so the cells name themselves. */}
        <div className="tv-head" aria-hidden="true">
          <span>{strings.score.colNum}</span>
          <span>{strings.score.colTask}</span>
          {/* The two figure columns are flush right, so their labels are
              too — a heading left-aligned over a right-aligned column is
              two objects, not one. */}
          {weighted && <span className="tv-head-figure">{strings.score.colWeight}</span>}
          {timed && <span className="tv-head-figure">{strings.score.colTime}</span>}
          <span>{strings.score.colVerdict}</span>
        </div>
        {visible.map((row) => (
          <TaskRow key={row.question.id} row={row} weighted={weighted} timed={timed} />
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

/** Exported for the deep dive, whose verdict pill must read identically. */
export const VERDICT_WORD: Record<Verdict, string> = {
  correct: strings.score.verdictCorrect,
  partial: strings.score.verdictPartial,
  failed: strings.score.verdictFailed,
};

function TaskRow({ row, weighted, timed }: { row: Row; weighted: boolean; timed: boolean }) {
  const { question, n, verdict, flagged } = row;

  // mcq results carry the option texts; hands-on results never do. That
  // presence is the branch — no examType prop needed, the results
  // themselves say which engine graded them.
  const isMcq = question.options !== undefined;
  // A hands-on id is the real ssh-able question directory, so it stays on
  // screen beside the title when the bank ships one. An mcq id is an
  // artifact of the pool a random draw sampled from — non-sequential and
  // meaningless to whoever sat the exam — so the # column is the only
  // number that row gets.
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
          {/* The row's second line. Rendered only when it would carry
              something: an mcq row has no ssh-able id, and a result from
              a bank that classified nothing has no domain either, and an
              empty line still costs a line. */}
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
      {/* One inset panel, not three things loose in the row. What the row
          discloses is the evidence, and then the way to the rest of it. */}
      <div className="tv-detail">
        {isMcq ? <McqAnswerReview question={question} /> : <CheckList checks={question.checks} />}
        {/* A real anchor rather than a click handler — the route is a
            fragment, so the browser's own navigation, middle-click and
            back button all work without this component importing a
            router. */}
        <p className="tv-more">
          <a className="tv-open" href={`#/results/${question.id}`}>
            {strings.score.openExplain(n)}
            <Icon name="chevron-right" />
          </a>
        </p>
      </div>
    </details>
  );
}

/**
 * How long the task pane was OPEN — never "spent" or "worked" (api.ts).
 *
 * Over the pacing budget, the overshoot is printed as a figure rather
 * than only tinted: the tint is the second signal and the "+2m 15s" is
 * the first, so the row reads the same in greyscale.
 */
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
          {/* The budget itself is a round figure the bank sets in
              minutes, so it is said as one — formatElapsed would read a
              six-minute target back as "6m 00s". */}
          <span className="sr-only">
            {" "}
            {strings.score.srOverTarget(formatElapsed(over * 1000), formatDuration(target))}
          </span>
        </>
      )}
    </span>
  );
}
