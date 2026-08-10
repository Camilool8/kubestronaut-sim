import { useEffect, useMemo, useState } from "react";
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

interface ExplainProps {
  results: Results;

  questionId: string;

  basePath?: string;

  live?: boolean;
}

export function Explain({ results, questionId, basePath = "/results", live = true }: ExplainProps) {
  const index = results.questions.findIndex((q) => q.id === questionId);
  const question = index === -1 ? null : results.questions[index];

  const stored: SolutionDetail | null =
    !live && question?.solution
      ? { id: question.id, markdown: question.solution, docs: question.docs }
      : null;

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

      .catch((err: unknown) => {
        if (!call.signal.aborted) setSolutionError(String(err));
      });
    return () => call.abort();
  }, [questionId, known, live]);

  // Hooks run before the unknown-task bail-out below, so this is computed for
  // every render. `checks` is the array carried on the results object, so it
  // only changes identity when a new grading result arrives.
  const checks = question?.checks;
  const evidence = useMemo(() => collectEvidence(checks ?? []), [checks]);

  if (question === null) {
    return (
      <div className="explain">
        <BackLink basePath={basePath} />
        <div className="explain-card explain-unknown">
          <h1 className="explain-title">{strings.explain.unknownTask}</h1>
        </div>
      </div>
    );
  }

  const shown = solution ?? stored;

  const verdict = verdictOf(question.verdict, question.earned, question.total);

  const isMcq = question.options !== undefined;

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

        {!isMcq &&
          (verdict === "correct" ? (
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

          <div className="explain-solution-body">
            {shown !== null ? (
              <Markdown>{shown.markdown}</Markdown>
            ) : !live ? (
              <p className="explain-note">{strings.explain.solutionHistorical}</p>
            ) : solutionError !== null ? (
              <p className="error-text">{strings.explain.solutionFailed(solutionError)}</p>
            ) : (
              <p className="explain-note">{strings.explain.solutionLoading}</p>
            )}
          </div>
          {shown !== null && <SolutionDocs docs={shown.docs} />}
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

function Timing({ question }: { question: QuestionResult }) {
  const spent = question.timeSpentSeconds;
  if (spent === undefined) return null;
  const open = formatElapsed(spent * 1000);
  const target = question.targetSeconds;
  return (
    <span className="explain-timing">
      {target !== undefined && target > 0
        ?

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

function externalHost(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.host : null;
}

interface Evidence {
  check: CheckResult;
  actual?: CheckArtifact;
  expected?: CheckArtifact;
  why?: CheckArtifact;
}

function collectEvidence(checks: CheckResult[]): Evidence[] {
  const out: Evidence[] = [];
  for (const check of checks) {
    const pick = (kind: CheckArtifact["kind"]) => check.artifacts?.find((a) => a.kind === kind);
    const actual = pick("actual");
    const expected = pick("expected");
    const why = pick("why");
    if (actual || expected || why) out.push({ check, actual, expected, why });
  }
  return out;
}

function EvidenceSection({ evidence }: { evidence: Evidence[] }) {
  // diffDocuments is an O(n·m) LCS that allocates an Int32Array of up to
  // (MAX_LINES + 1)² entries. `evidence` is the only input, and it is itself
  // memoized on the graded checks, so one pass per block per result.
  const blocks = useMemo(
    () =>
      evidence.map((e) => ({
        ...e,
        diff: e.actual && e.expected ? diffDocuments(e.actual.body, e.expected.body) : null,
      })),
    [evidence],
  );

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

      {diff !== null && diff.compared && diff.changedLines === 0 && (
        <p className="explain-note">{strings.explain.diffIdentical}</p>
      )}
      {diff !== null && !diff.compared && (
        <p className="explain-note">{strings.explain.diffTooLong}</p>
      )}
      {actual && !expected && <p className="explain-note">{strings.explain.actualOnlyNote}</p>}
      {expected && !actual && <p className="explain-note">{strings.explain.expectedOnlyNote}</p>}

      {why && (
        <div className="explain-why">
          <p className="explain-why-title">{strings.explain.whyTitle}</p>
          <p className="explain-why-body">{why.body}</p>
        </div>
      )}
    </article>
  );
}

function plain(artifact: CheckArtifact): DiffLine[] {
  return toLines(artifact.body).map((text) => ({ text, changed: false }));
}

interface DocumentPaneProps {
  title: string;
  artifact: CheckArtifact;
  lines: DiffLine[];

  marker: "-" | "+";
}

function DocumentPane({ title, artifact, lines, marker }: DocumentPaneProps) {
  return (
    <figure className="explain-pane">
      <figcaption className="explain-pane-head">
        <span className="explain-pane-title">{title}</span>
        {artifact.lang && <span className="explain-pane-lang">{artifact.lang}</span>}
      </figcaption>

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
