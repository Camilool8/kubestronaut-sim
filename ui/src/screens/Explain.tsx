import { useEffect, useState } from "react";
import {
  getSolution,
  type CheckArtifact,
  type CheckResult,
  type QuestionResult,
  type Results,
  type SolutionDetail,
} from "../api";
import { CheckList } from "../components/CheckList";
import { Icon } from "../components/Icon";
import { Markdown } from "../components/Markdown";
import { McqAnswerReview } from "../components/McqAnswerReview";
import { verdictOf } from "../components/resultsModel";
import { VERDICT_WORD } from "../components/TaskVerdicts";
import { diffDocuments, toLines, type DiffLine } from "../lib/explainDiff";
import { formatDuration, formatElapsed } from "../lib/format";
import { strings } from "../strings";

/**
 * 1j, the explanation deep dive: one graded task, opened from a verdict
 * row at `#/results/<questionId>`.
 *
 * THE SHAPE THIS SCREEN IS REALLY FOR. The brief's centrepiece is two
 * documents side by side — what the cluster had, what the check wanted —
 * and that is the EXCEPTION. A check emits a document only if its script
 * called `show_actual` / `show_expected` / `show_why`
 * (banks/_lib/checks.sh), and today two of the twenty-two CKAD questions
 * do. Twenty arrive here with their check messages and a reference
 * solution and nothing else, so the ordinary case is composed first and
 * the panes are an enhancement layered on top of it. A screen that reads
 * as broken on twenty tasks out of twenty-two has failed however well the
 * two lucky ones look.
 *
 * WHAT IS DELIBERATELY ABSENT. The brief draws a third link in the why
 * card's footer — "kubernetes.io/docs · Ingress path types ↗". Nothing in
 * the data model carries an upstream URL: not `QuestionResult`, not
 * `CheckResult`, not `CheckArtifact`, and not the bank format behind
 * them. Inventing the link here would mean guessing a URL per task and
 * shipping a link that is wrong for some of them, which on a study tool
 * is worse than no link at all. It arrives when a bank field does.
 *
 * Routing lives in Score.tsx, not App.tsx: the visible screen is a
 * function of `session.state` first, and this view exists only inside
 * `ended`.
 */
interface ExplainProps {
  /** The whole graded attempt — this screen steps through it. */
  results: Results;
  /** The `<id>` from `#/results/<id>`, which may name nothing at all. */
  questionId: string;
}

export function Explain({ results, questionId }: ExplainProps) {
  const index = results.questions.findIndex((q) => q.id === questionId);
  const question = index === -1 ? null : results.questions[index];

  // Eagerly, and not behind the disclosure the verdict row uses. The
  // attempt is over, so there is no answer left to protect (that is
  // HintTray's job, during a training run); this screen's entire purpose
  // is to explain the task, and gating the one document that says how it
  // should have been done behind a click would be timidity, not pedagogy.
  //
  // There is deliberately no "clear the previous task's solution" branch
  // here: Score.tsx keys this component by the question id, so stepping
  // to the next task is a fresh mount with fresh state. Resetting inside
  // the effect instead would be a synchronous setState in an effect body
  // — a cascading render, and the thing react-hooks/set-state-in-effect
  // exists to catch.
  const [solution, setSolution] = useState<SolutionDetail | null>(null);
  const [solutionError, setSolutionError] = useState<string | null>(null);
  const known = question !== null;
  useEffect(() => {
    if (!known) return;
    const call = new AbortController();
    getSolution(questionId, call.signal)
      .then((r) => {
        if (r.ok) setSolution(r.solution);
        else setSolutionError(r.error);
      })
      // An aborted fetch rejects, and it rejects precisely because this
      // component is about to render a different task. Reporting it would
      // paint the previous task's failure onto the next one.
      .catch((err: unknown) => {
        if (!call.signal.aborted) setSolutionError(String(err));
      });
    return () => call.abort();
  }, [questionId, known]);

  if (question === null) {
    // A bookmark from an earlier draw, or a hand-typed fragment. It must
    // not blank the screen, and it keeps the h1 the screen would have had
    // so the page still announces what it is.
    return (
      <div className="explain">
        <BackLink />
        <div className="explain-card explain-unknown">
          <h1 className="explain-title">{strings.explain.unknownTask}</h1>
        </div>
      </div>
    );
  }

  const verdict = verdictOf(question.verdict, question.earned, question.total);
  // mcq results carry the option texts and hands-on results never do, so
  // the payload itself says which engine graded it — the same branch
  // TaskVerdicts makes, for the same reason.
  const isMcq = question.options !== undefined;
  // The bank's title when it ships one; otherwise the id, which for a
  // hands-on task is the real ssh-able question directory.
  const name = question.title || question.id;

  const prev = index > 0 ? results.questions[index - 1] : null;
  const next = index < results.questions.length - 1 ? results.questions[index + 1] : null;

  const eyebrow = [
    strings.explain.taskLabel(index + 1, results.questions.length),
    question.domain || strings.score.domainUnknown,
    question.weightPct !== undefined ? strings.explain.weight(question.weightPct) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(strings.explain.eyebrowSeparator);

  const evidence = collectEvidence(question.checks);

  return (
    <div className="explain">
      <BackLink />

      <article className="explain-card">
        <header className="explain-head">
          <div className="explain-head-lead">
            <p className="explain-eyebrow">{eyebrow}</p>
            <h1 className="explain-title">{name}</h1>
            <p className="explain-pills">
              <span className={`explain-verdict is-${verdict}`}>
                {VERDICT_WORD[verdict]}
                <span className="explain-points">
                  <span className="sr-only">{strings.explain.pointsLabel}: </span>
                  {question.earned}/{question.total}
                </span>
              </span>
              <Timing question={question} />
            </p>
          </div>

          {/* Only the steps that exist are drawn. A greyed-out "Task 00"
              at the first task is a control conveying its state with
              tone, and the pair is right-aligned as a group, so a missing
              half moves nothing the reader was looking at. */}
          {(prev !== null || next !== null) && (
            <nav className="explain-nav" aria-label={strings.explain.navLabel}>
              {prev !== null && (
                <a className="btn explain-step" href={`#/results/${prev.id}`}>
                  <Icon name="chevron-left" />
                  <span className="sr-only">{strings.explain.prevLabel}: </span>
                  {strings.explain.prevTask(index)}
                </a>
              )}
              {next !== null && (
                <a className="btn explain-step" href={`#/results/${next.id}`}>
                  <span className="sr-only">{strings.explain.nextLabel}: </span>
                  {strings.explain.nextTask(index + 2)}
                  <Icon name="chevron-right" />
                </a>
              )}
            </nav>
          )}
        </header>

        <section className="explain-section">
          <h2 className="explain-section-title">
            {isMcq ? strings.explain.answerTitle : strings.explain.checksTitle}
          </h2>
          {isMcq ? (
            <McqAnswerReview question={question} />
          ) : question.checks.length > 0 ? (
            <CheckList checks={question.checks} />
          ) : (
            <p className="explain-note">{strings.explain.checksNone}</p>
          )}
        </section>

        {/* An mcq question has no cluster behind it, so it has no captured
            state to be missing — saying "no captured state for this task"
            there would invent an absence. The answer review above is the
            whole of the evidence a multiple-choice grader has. */}
        {!isMcq &&
          (verdict === "correct" ? (
            // Artifacts are dropped from checks that PASSED (api.ts), so
            // a full-marks task can never have evidence. Say there is
            // nothing to explain rather than render an empty section.
            <NoteSection title={strings.explain.correctTitle} body={strings.explain.correctBody} />
          ) : evidence.length === 0 ? (
            <NoteSection
              title={strings.explain.noEvidenceTitle}
              body={strings.explain.noEvidenceBody}
            />
          ) : (
            evidence.map((e) => <EvidenceBlock key={e.check.name} evidence={e} />)
          ))}

        <section className="explain-section">
          <h2 className="explain-section-title">
            {isMcq ? strings.mcq.explanation : strings.explain.solutionTitle}
          </h2>
          {solution !== null ? (
            <Markdown>{solution.markdown}</Markdown>
          ) : solutionError !== null ? (
            <p className="error-text">{strings.explain.solutionFailed(solutionError)}</p>
          ) : (
            <p className="explain-note">{strings.explain.solutionLoading}</p>
          )}
        </section>
      </article>
    </div>
  );
}

function BackLink() {
  return (
    <a className="explain-back" href="#/results">
      <Icon name="chevron-left" />
      {strings.explain.backToResults}
    </a>
  );
}

/**
 * How long the task pane was OPEN, and the pacing budget beside it.
 *
 * Never "spent" or "worked": the figure measures a pane on a screen, and
 * a candidate who was thinking in a terminal accrues it too (api.ts).
 */
function Timing({ question }: { question: QuestionResult }) {
  const spent = question.timeSpentSeconds;
  if (spent === undefined) return null;
  const open = formatElapsed(spent * 1000);
  const target = question.targetSeconds;
  return (
    <span className="explain-timing">
      {target !== undefined && target > 0
        ? // The budget is a round figure the bank sets in minutes, so it
          // is said as one — formatElapsed reads a six-minute target back
          // as "6m 00s".
          strings.explain.timingTarget(open, formatDuration(target))
        : strings.explain.timing(open)}
    </span>
  );
}

function NoteSection({ title, body }: { title: string; body: string }) {
  return (
    <section className="explain-section">
      <h2 className="explain-section-title">{title}</h2>
      <p className="explain-note">{body}</p>
    </section>
  );
}

/**
 * One check's captured documents, grouped BY THE CHECK that captured
 * them.
 *
 * Not flattened into one actual/expected/why triple for the question:
 * q19 has two checks that each capture something, and they capture
 * different objects — a Service and an EndpointSlice. Stacked under one
 * heading, those two panes would read as one comparison and teach the
 * candidate that the Service is missing fields the EndpointSlice never
 * had.
 */
interface Evidence {
  check: CheckResult;
  actual?: CheckArtifact;
  expected?: CheckArtifact;
  why?: CheckArtifact;
}

function collectEvidence(checks: CheckResult[]): Evidence[] {
  const out: Evidence[] = [];
  for (const check of checks) {
    // First of each kind wins. `kind` is closed at three values because
    // this screen has exactly three places to put one (api.ts), so a
    // check that called show_actual twice has one place and two
    // documents; the first is the one its message was written about.
    const pick = (kind: CheckArtifact["kind"]) => check.artifacts?.find((a) => a.kind === kind);
    const actual = pick("actual");
    const expected = pick("expected");
    const why = pick("why");
    if (actual || expected || why) out.push({ check, actual, expected, why });
  }
  return out;
}

function EvidenceBlock({ evidence }: { evidence: Evidence }) {
  const { check, actual, expected, why } = evidence;

  // Computed HERE, in the client, and deliberately. The grader emits two
  // documents and never a diff: docs/bank-spec.md:324 bans `diff` inside
  // a validator because SCORING on line order fails a correct answer that
  // is merely ordered differently. Rendering has no such property, so the
  // highlight is a view concern and the ban upstream stays intact.
  const diff = actual && expected ? diffDocuments(actual.body, expected.body) : null;

  return (
    <section className="explain-section explain-evidence">
      <p className="explain-evidence-eyebrow">{strings.explain.evidenceEyebrow}</p>
      <h2 className="explain-section-title">{check.desc}</h2>

      {(actual || expected) && (
        <div className="explain-panes">
          {actual && (
            <DocumentPane
              title={strings.explain.actualTitle}
              artifact={actual}
              lines={diff?.actual ?? plain(actual)}
              marker="-"
            />
          )}
          {expected && (
            <DocumentPane
              title={strings.explain.expectedTitle}
              artifact={expected}
              lines={diff?.expected ?? plain(expected)}
              marker="+"
            />
          )}
        </div>
      )}

      {/* The panes carry a red tint and a green tint and nothing else in
          the brief, which puts the whole meaning of the screen in one
          channel. The "-"/"+" gutter is the second channel and this
          legend is what makes it legible without one. */}
      {diff !== null && diff.compared && diff.changedLines > 0 && (
        <p className="explain-note">{strings.explain.diffLegend}</p>
      )}
      {diff !== null && diff.compared && diff.changedLines === 0 && (
        <p className="explain-note">{strings.explain.diffIdentical}</p>
      )}
      {diff !== null && !diff.compared && (
        <p className="explain-note">{strings.explain.diffTooLong}</p>
      )}
      {actual && !expected && <p className="explain-note">{strings.explain.actualOnlyNote}</p>}

      {why && (
        <div className="explain-why">
          <h3 className="explain-why-title">{strings.explain.whyTitle}</h3>
          <p className="explain-why-body">{why.body}</p>
        </div>
      )}
    </section>
  );
}

/** An artifact with no counterpart: every line renders, none is marked. */
function plain(artifact: CheckArtifact): DiffLine[] {
  return toLines(artifact.body).map((text) => ({ text, changed: false }));
}

interface DocumentPaneProps {
  title: string;
  artifact: CheckArtifact;
  lines: DiffLine[];
  /** The gutter glyph for THIS pane's unmatched lines. */
  marker: "-" | "+";
}

/**
 * One captured document, on a machine surface.
 *
 * The pane is `--machine-*` in BOTH themes because what it shows is the
 * cluster and not the app (DESIGN.md, "dark surfaces name the machine").
 * Its caption is not: the title is an app-level eyebrow above the pane,
 * the same treatment `.tv-head` gets, which keeps the machine palette to
 * the thing that is actually a machine.
 *
 * Deliberately NOT syntax-highlighted, though `lang` would allow it. The
 * one colour channel this pane has is spent on the comparison; a keyword
 * hue underneath a diff tint reads as a third state that means nothing.
 * `lang` is rendered as a label instead, which is the honest use of it.
 */
function DocumentPane({ title, artifact, lines, marker }: DocumentPaneProps) {
  return (
    <figure className="explain-pane">
      <figcaption className="explain-pane-head">
        <span className="explain-pane-title">{title}</span>
        {artifact.lang && <span className="explain-pane-lang">{artifact.lang}</span>}
      </figcaption>
      {/* Focusable, because it scrolls: a keyboard user with no pointer
          has no other way to reach the right-hand end of a long line
          (Scroll-Inside, and the same treatment .control-log-pane takes). */}
      <pre className="explain-pane-body" tabIndex={0}>
        <code>
          {lines.map((line, i) => (
            <span
              key={i}
              className={
                line.changed
                  ? `explain-line ${marker === "-" ? "is-removed" : "is-added"}`
                  : "explain-line"
              }
            >
              {/* The glyph is aria-hidden and user-select: none — a
                  screen reader gets the words instead, and a candidate
                  copying the YAML out gets the YAML and not a diff. */}
              <span className="explain-line-mark" aria-hidden="true">
                {line.changed ? marker : " "}
              </span>
              {line.changed && <span className="sr-only">{strings.explain.lineChanged} </span>}
              {line.text}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
