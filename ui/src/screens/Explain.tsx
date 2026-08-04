import { useEffect, useState } from "react";
import {
  getSolution,
  type CheckArtifact,
  type CheckResult,
  type QuestionResult,
  type Results,
  type SolutionDetail,
  type SolutionDoc,
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
 * WHERE THE SOLUTION LIVES. Here, and only here. The verdict row on the
 * results table used to carry a disclosure with the same markdown in it,
 * so the one document that says how the task should have been done was
 * read twice or not at all. This section is now the screen's
 * destination: its prose is capped at a reading measure while its
 * listings and tables keep the full card, because a `kubectl` line and a
 * paragraph do not want the same width.
 *
 * WHAT IS DELIBERATELY ABSENT. The brief's "Add 2 similar tasks to my
 * drill list" button. There is no drill list — nothing in this product
 * accumulates tasks for later — and the capability that genuinely exists
 * is a different one: starting a fresh attempt narrowed to the domains
 * you scored worst in, offered from the Score screen's sidebar beside
 * the ranking that justifies it. A second entry point here would be
 * scoped to one task's domain, which is a worse drill than the one
 * already on offer, and a button for a list that does not exist is the
 * failure DESIGN.md's last "don't" is about. It arrives with the list.
 *
 * The brief's upstream link — "kubernetes.io/docs · Ingress path types
 * ↗" — is no longer absent, but it moved: `docs` hangs off
 * `SolutionDetail`, which is per QUESTION, so the links are the
 * solution's footer rather than a why card's. A check that wanted
 * reading of its own would need a field on `CheckArtifact`, and no bank
 * has asked for one. Most questions carry no `docs` at all today, and
 * the footer is simply not drawn then — see SolutionDocs.
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
  /**
   * The route this screen's own links hang off, with no trailing slash.
   *
   * "/results" is the attempt that just ended, which is where this screen
   * has always lived. Hosted mode reads a PAST attempt back at
   * "/history/<attemptId>" and renders the identical component under it,
   * so the base cannot be a constant — every step and back link here
   * would jump out of the record and into the live session.
   */
  basePath?: string;
  /**
   * Whether a live exam environment is behind this screen.
   *
   * False when reading back a stored attempt. The reference solution is
   * part of the bank, and the bank is in a session Pod — so there is
   * nothing to ask when no session is running, and asking anyway when one
   * IS running is worse than useless: it would answer from whichever exam
   * is loaded now, which need not be the exam being reviewed.
   */
  live?: boolean;
}

export function Explain({ results, questionId, basePath = "/results", live = true }: ExplainProps) {
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
    if (!known || !live) return;
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
  }, [questionId, known, live]);

  if (question === null) {
    // A bookmark from an earlier draw, or a hand-typed fragment. It must
    // not blank the screen, and it keeps the h1 the screen would have had
    // so the page still announces what it is.
    return (
      <div className="explain">
        <BackLink basePath={basePath} />
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
      <BackLink basePath={basePath} />

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
                <a className="btn explain-step" href={`#${basePath}/${prev.id}`}>
                  <Icon name="chevron-left" />
                  <span className="sr-only">{strings.explain.prevLabel}: </span>
                  {strings.explain.prevTask(index)}
                </a>
              )}
              {next !== null && (
                <a className="btn explain-step" href={`#${basePath}/${next.id}`}>
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
            <EvidenceSection evidence={evidence} />
          ))}

        <section className="explain-section explain-solution">
          <h2 className="explain-section-title">
            {isMcq ? strings.mcq.explanation : strings.explain.solutionTitle}
          </h2>
          {/* The box, not its contents, carries the floor height. A
              one-line "Loading…" in a section that then grows to forty
              lines of markdown is a jump the reader's eye has to
              re-acquire; reserving the shortest solution's worth of room
              means the arrival fills a space that was already there. */}
          <div className="explain-solution-body">
            {solution !== null ? (
              <Markdown>{solution.markdown}</Markdown>
            ) : !live ? (
              // Not an error: nothing failed, and a red line saying a
              // fetch went wrong would read as a broken page rather than
              // as the boundary of what a saved attempt contains.
              <p className="explain-note">{strings.explain.solutionHistorical}</p>
            ) : solutionError !== null ? (
              <p className="error-text">{strings.explain.solutionFailed(solutionError)}</p>
            ) : (
              <p className="explain-note">{strings.explain.solutionLoading}</p>
            )}
          </div>
          {solution !== null && <SolutionDocs docs={solution.docs} />}
        </section>
      </article>
    </div>
  );
}

function BackLink({ basePath }: { basePath: string }) {
  return (
    <a className="explain-back" href={`#${basePath}`}>
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
 * The upstream reading a bank author attached to this question, as the
 * solution's footer.
 *
 * ABSENT IS THE ORDINARY CASE, and it renders as nothing at all. `docs`
 * is an authoring task the banks have barely started, so most questions
 * arrive with the field missing or empty, and the section simply ends
 * after the prose. There is no "no links for this task" note and no
 * empty rail waiting to be filled: an absence the reader was never
 * promised cannot read as a failure, whereas a placeholder for one
 * announces a gap that is not there. Same discipline the evidence panes
 * take, and for the same reason.
 *
 * These leave the app. The candidate opens them from their own browser,
 * not from the exam desktop behind its documentation allowlist proxy, so
 * they are treated as external links properly: a new tab, `noreferrer
 * noopener`, and the host printed beside the label so the destination is
 * visible before the click rather than only in the status bar.
 */
function SolutionDocs({ docs }: { docs?: SolutionDoc[] }) {
  const links = (docs ?? [])
    .map((doc) => ({ doc, host: externalHost(doc.url) }))
    .filter((link): link is { doc: SolutionDoc; host: string } => link.host !== null);
  if (links.length === 0) return null;

  return (
    <footer className="explain-docs">
      <p className="explain-docs-title">{strings.explain.docsTitle}</p>
      <ul className="explain-docs-list">
        {links.map(({ doc, host }) => (
          <li key={doc.url}>
            <a className="explain-doc" href={doc.url} target="_blank" rel="noreferrer noopener">
              <span className="explain-doc-label">{doc.label}</span>
              <span className="explain-doc-host">{host}</span>
              <span className="sr-only"> ({strings.explain.docsNewTab})</span>
            </a>
          </li>
        ))}
      </ul>
    </footer>
  );
}

/**
 * The host of an http(s) URL, or null for anything else.
 *
 * Two jobs in one function, and the second is why it is not a one-liner.
 * It is the visible affordance — the host prints beside the label, and
 * nothing here invents it: whatever the server sent is what shows. And
 * it is the gate. A `docs` entry is bank content reaching an `href`,
 * which is one of the few places a string out of a file becomes
 * executable, so a `javascript:` or `data:` URL is DROPPED rather than
 * rendered inert; a link that visibly does nothing spends the
 * candidate's trust, and one that is not there costs nothing.
 */
function externalHost(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // A relative path, or not a URL at all. Nothing on this screen can
    // resolve it, so nothing on this screen should link to it.
    return null;
  }
  return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.host : null;
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

/**
 * Every capturing check's evidence, under ONE section heading.
 *
 * The grouping is the whole design of this section. Each check keeps its
 * own sub-heading and its own panes — flattening them would teach the
 * candidate that q19's Service is missing fields its EndpointSlice never
 * had — but the chrome AROUND them is hoisted and drawn once: the
 * heading that says these are captures, and the legend that says how to
 * read a marked line. Both used to be per-block, which on a task with
 * three capturing checks meant the same four words and the same
 * 180-character key three times. Most CKAD questions are being taught to
 * capture this wave, so three blocks is the shape to design for and one
 * block is the easy case, not the other way round.
 */
function EvidenceSection({ evidence }: { evidence: Evidence[] }) {
  // Computed HERE, in the client, and deliberately. The grader emits two
  // documents and never a diff: docs/bank-spec.md ("check-lint rules")
  // bans `diff` inside a validator because SCORING on line order fails a
  // correct answer that is merely ordered differently. Rendering has no
  // such property, so the highlight is a view concern and the ban
  // upstream stays intact.
  const blocks = evidence.map((e) => ({
    ...e,
    diff: e.actual && e.expected ? diffDocuments(e.actual.body, e.expected.body) : null,
  }));

  // The legend is a key to a notation, so it is drawn if ANY comparison
  // below actually marked something, and never once per comparison. It
  // sits above the first pane pair rather than under the last, because a
  // key read after the thing it decodes has been read too late.
  const marksAnything = blocks.some(
    (b) => b.diff !== null && b.diff.compared && b.diff.changedLines > 0,
  );

  return (
    <section className="explain-section explain-evidence">
      <h2 className="explain-section-title">{strings.explain.evidenceTitle(evidence.length)}</h2>
      {marksAnything && <p className="explain-note">{strings.explain.diffLegend}</p>}
      <div className="explain-checks">
        {blocks.map((block) => (
          <EvidenceBlock key={block.check.name} block={block} />
        ))}
      </div>
    </section>
  );
}

type EvidenceBlockData = Evidence & { diff: ReturnType<typeof diffDocuments> | null };

function EvidenceBlock({ block }: { block: EvidenceBlockData }) {
  const { check, actual, expected, why, diff } = block;

  return (
    <article className="explain-check">
      <h3 className="explain-check-title">{check.desc}</h3>

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

      {/* What remains here is what is true of THIS pair and not of the
          section: that these two documents agreed, that they were too
          long to compare, that this capture has no counterpart. The key
          to the "-"/"+" notation is hoisted to EvidenceSection, because
          it is the same sentence every time. */}
      {diff !== null && diff.compared && diff.changedLines === 0 && (
        <p className="explain-note">{strings.explain.diffIdentical}</p>
      )}
      {diff !== null && !diff.compared && (
        <p className="explain-note">{strings.explain.diffTooLong}</p>
      )}
      {actual && !expected && <p className="explain-note">{strings.explain.actualOnlyNote}</p>}
      {expected && !actual && <p className="explain-note">{strings.explain.expectedOnlyNote}</p>}

      {/* A caption, not a heading. `show_why` output is an ARTIFACT this
          check emitted, exactly as the panes beside it are, and the
          screen's rule is that mono eyebrows label artifacts while sans
          headings label sections. Demoting it also keeps the outline to
          two levels under the h1 — a screen with three capturing checks
          was otherwise announcing six headings for two ideas. */}
      {why && (
        <div className="explain-why">
          <p className="explain-why-title">{strings.explain.whyTitle}</p>
          <p className="explain-why-body">{why.body}</p>
        </div>
      )}
    </article>
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
