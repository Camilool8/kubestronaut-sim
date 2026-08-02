import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getQuestion, type ExamQuestionInfo, type SessionMode } from "../api";
import { useAsync } from "../lib/useAsync";
import { desktopClipboard } from "../lib/desktopClipboard";
import { pasteChordLabel } from "../lib/desktopKeymap";
import { formatDuration } from "../lib/format";
import { isTypingTarget } from "../lib/typing";
import { strings } from "../strings";
import { Async } from "./Async";
import { Icon } from "./Icon";
import { Markdown } from "./Markdown";
import { HintTray } from "./HintTray";
import { Navigator, type NavigatorQuestion } from "./Navigator";
import { Skeleton } from "./Pending";
import { toastStore } from "./toastStore";
import { marksStore } from "./marksStore";

interface QuestionPanelProps {
  questions: ExamQuestionInfo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * Rendered instead of the navigator and pane when there are no questions.
   * The exam list arriving is a separate fetch from any one question, and
   * "it failed" and "it hasn't landed yet" must not both render as a blank
   * panel — which is exactly what they did before this existed.
   */
  emptyState?: ReactNode;
  /**
   * The attempt's mode. Only "training" renders the hint tray — and the
   * hint/solution endpoints 403 in every other mode regardless, so this
   * is an affordance over a server-side rule, not the rule.
   */
  mode?: SessionMode;
}

// The task pane. Its whole job is one task: the candidate reads it in a
// 420px column, beside a terminal, under a clock that cannot be paused.
//
// Three bands, and the order is the order the questions get asked in:
//
//   head    which task this is, what it is called, and the four facts
//           that place it — domain, share of the points, pacing budget,
//           and the box it is graded on
//   pane    the machine block (where to work, copyable), the bank's
//           markdown, and what the grader will look at
//   footer  previous / all tasks / next
//
// Navigation used to be a compact stepper row at the top of the header,
// beside the current question's id. It is now the labelled footer row the
// design brief draws: the same three moves, at the end of the reading
// rather than above it, and discoverable without a keyboard.
//
// Navigator is absolutely positioned INSIDE .question-panel, which is
// already position: relative. That is load-bearing rather than incidental:
// opening it changes no flex geometry, so .desktop-pane never resizes, so
// noVNC's ResizeObserver never fires. ui/src/styles/layout.test.ts pins
// both halves of that pairing; see the comment at the top of Navigator.tsx
// for the rest of it.
export function QuestionPanel({
  questions,
  selectedId,
  onSelect,
  emptyState = null,
  mode,
}: QuestionPanelProps) {
  const [jumpOpen, setJumpOpen] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const jumpTriggerRef = useRef<HTMLButtonElement>(null);

  // Subscribing to the version counter rather than the sets themselves:
  // useSyncExternalStore needs a snapshot whose identity is stable between
  // notifications, and a mutable Set is not that.
  useSyncExternalStore(marksStore.subscribe, marksStore.getVersion);

  const index = questions.findIndex((q) => q.id === selectedId);
  const selected = index === -1 ? undefined : questions[index];
  const prev = index > 0 ? questions[index - 1] : undefined;
  const next = index >= 0 && index < questions.length - 1 ? questions[index + 1] : undefined;

  const load = useCallback(
    (signal: AbortSignal) => getQuestion(selectedId as string, signal),
    [selectedId],
  );
  const question = useAsync(load, [selectedId], { enabled: selectedId !== null });

  // A new question starts at its own first line. Without this the pane keeps
  // the previous question's scroll offset, so moving from a long question to
  // a short one lands mid-sentence. scrollTop rather than scrollTo() because
  // the latter does not exist on elements in jsdom, and because base.css
  // forces scroll-behavior: auto under reduced motion anyway — a smooth
  // scroll here would only make the two motion classes behave differently.
  useEffect(() => {
    if (!selectedId) return;
    marksStore.markViewed(selectedId);
    if (paneRef.current) paneRef.current.scrollTop = 0;
  }, [selectedId]);

  // [ and ] step between questions, G opens and closes the navigator, F
  // flags the task on screen — the same key the navigator's own foot
  // names, working from the task you are reading as well as from inside
  // the grid. Deliberately not Alt+arrows: those are Back/Forward on
  // Windows and Linux, and in a no-router SPA Back navigates out of a
  // running exam. Bare keys are safe because the handler below bows out
  // over the desktop canvas, over any focused form control, and while a
  // dialog is open — the product does have form controls (the mode
  // picker, the clipboard textarea, the keyboard checkboxes).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      // The RFB canvas owns the keyboard while focused, correctly — the
      // candidate is typing into a terminal.
      if (target?.closest(".desktop-pane")) return;
      if (isTypingTarget(target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      // G is global rather than scoped to the open navigator, because the
      // strip along its foot names it and that strip has to be true from
      // the question you were reading as well as from inside the grid.
      if (event.key === "g" || event.key === "G") {
        event.preventDefault();
        setJumpOpen((open) => {
          if (open) jumpTriggerRef.current?.focus();
          return !open;
        });
        return;
      }
      // The navigator handles F for the tile under the cursor while it is
      // open; this one is for the task pane behind it.
      if ((event.key === "f" || event.key === "F") && !jumpOpen) {
        if (!selectedId) return;
        event.preventDefault();
        marksStore.toggleMark(selectedId);
        return;
      }
      if (event.key !== "[" && event.key !== "]") return;
      const step = event.key === "[" ? prev : next;
      if (!step) return;
      event.preventDefault();
      onSelect(step.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [prev, next, onSelect, selectedId, jumpOpen]);

  const closeJump = (returnFocus: boolean) => {
    setJumpOpen(false);
    if (returnFocus) jumpTriggerRef.current?.focus();
  };

  const marked = selectedId !== null && marksStore.isMarked(selectedId);

  // The denominator for the weight chip: the drawn attempt's own total, so
  // a randomly drawn subset reports its own arithmetic rather than the
  // whole pool's. Recomputed only when the question list itself changes.
  const totalWeight = useMemo(
    () => questions.reduce((sum, q) => sum + (q.weight || 0), 0),
    [questions],
  );

  return (
    <section
      id="question-panel"
      className="question-panel"
      aria-label={strings.questionPanel.regionLabel}
    >
      {/* No collapse control. The exam is a split screen by definition —
          the questions beside the desktop you answer them on — and a
          full-screen desktop is not a state this product has. The panel
          is resizable between 280px and 600px and nothing narrower,
          because 280px is where the footer nav stops fitting on one row. */}
      {questions.length === 0 && <div className="question-empty">{emptyState}</div>}
      {questions.length > 0 && (
        <>
          <header className="task-head">
            <div className="task-head-row">
              <span className="task-counter">
                {index >= 0 ? strings.questionPanel.taskCounter(index + 1, questions.length) : ""}
              </span>
              {selected && (
                <button
                  className="question-mark"
                  onClick={() => marksStore.toggleMark(selected.id)}
                  aria-pressed={marked}
                >
                  <Icon name={marked ? "flag-filled" : "flag"} />
                  {strings.questionPanel.mark}
                  {/* aria-hidden: the chord is a visual reminder, and
                      inside a button it would otherwise land in the middle
                      of the accessible name. The shortcut reference (?) is
                      where it is said out loud. */}
                  <kbd className="key-hint" aria-hidden="true">
                    {strings.questionPanel.markKey}
                  </kbd>
                </button>
              )}
            </div>
            {/* The bank's short label, or its id when it has none — a task
                pane with no heading at all reads as a fragment. The
                markdown below opens with its own "# Question 4 | ..."
                heading, which Markdown shifts to an h2 as well; see the
                note in the report about retiring the bank's title line. */}
            {selected && (
              <h2 className="task-title">{selected.title ?? selected.id}</h2>
            )}
            {selected && <TaskChips question={selected} totalWeight={totalWeight} />}
          </header>

          {/* aria-busy rather than blanking to "Loading…": a question fetch
              against a local facilitator normally lands in tens of
              milliseconds, and throwing away readable text for that long
              flashes the pane on every step between questions. The previous
              question stays up until the next one is ready. */}
          <div className="question-pane" ref={paneRef} aria-busy={question.status === "loading"}>
            {selected?.instance && <WorkFrom instance={selected.instance} />}
            <Async
              state={question}
              loading={<QuestionSkeleton />}
              error={(message, reload) => (
                <div className="pane-error" role="alert">
                  <p className="error-text">{strings.questionPanel.loadFailed(message)}</p>
                  <button className="btn" onClick={reload}>
                    {strings.questionPanel.retry}
                  </button>
                </div>
              )}
            >
              {(data) => <Markdown>{data.markdown}</Markdown>}
            </Async>
            {/* Only under text that actually arrived: a "graded on" card
                floating under a load failure would be the only thing on
                screen, and it says nothing about how to recover. */}
            {selected && question.status === "success" && <GradedOn question={selected} />}
            {/* Inside the scrolling pane, below the question: a candidate
                reaching for a hint has just finished reading, and the
                tray should be where their eye already is. Keyed by id so
                moving question resets it rather than carrying a revealed
                hint across. */}
            {mode === "training" && selected && selected.hintCount > 0 && (
              <HintTray key={selected.id} questionId={selected.id} hintCount={selected.hintCount} />
            )}
          </div>

          {/* Previous / all tasks / next, labelled and at the foot of the
              reading. Exactly one primary button: Next is the move the
              screen expects, and the last task simply disables it rather
              than growing a second submit — the topbar already carries the
              only one, and two ways to end an attempt is one too many. */}
          <footer className="task-nav">
            <button
              className="btn task-nav-step"
              onClick={() => prev && onSelect(prev.id)}
              disabled={!prev}
              aria-label={strings.questionPanel.prev}
            >
              <Icon name="chevron-left" />
              {strings.questionPanel.prevShort}
            </button>
            <button
              ref={jumpTriggerRef}
              className="btn task-nav-jump"
              onClick={() => setJumpOpen((v) => !v)}
              aria-expanded={jumpOpen}
              aria-controls={jumpOpen ? "question-jump" : undefined}
              disabled={!selected}
            >
              <Icon name="grid" className="trigger-glyph" />
              {strings.questionPanel.allTasks}
              <kbd className="key-hint" aria-hidden="true">
                {strings.navigator.keyGridKey}
              </kbd>
              <span className="sr-only">
                {index >= 0
                  ? strings.navigator.position(index + 1, questions.length)
                  : strings.navigator.open}
              </span>
            </button>
            <button
              className="btn btn-primary task-nav-step"
              onClick={() => next && onSelect(next.id)}
              disabled={!next}
              aria-label={strings.questionPanel.next}
            >
              {strings.questionPanel.nextShort}
              <Icon name="chevron-right" />
            </button>
          </footer>

          {jumpOpen && (
            <Navigator
              id="question-jump"
              questions={toNavigator(questions)}
              selectedId={selectedId}
              // "opened", never "answered": this screen knows it rendered
              // the question's text and nothing more (marksStore.ts).
              progress="opened"
              onSelect={(id) => {
                onSelect(id);
                closeJump(true);
              }}
              onDismiss={() => closeJump(true)}
            />
          )}
        </>
      )}
    </section>
  );
}

// The four facts that place a task, in the order they answer "should I do
// this one now?": what it is about, what it is worth, how long it is meant
// to take, and which box it is graded on.
//
// Every one of them is optional at the source. `targetSeconds` in
// particular arrives only from a facilitator new enough to send it, and an
// older one simply has no pacing chip — never a blank or a zero.
function TaskChips({
  question,
  totalWeight,
}: {
  question: ExamQuestionInfo;
  totalWeight: number;
}) {
  const pct = totalWeight > 0 && question.weight > 0 ? (question.weight / totalWeight) * 100 : null;
  const target = question.targetSeconds;
  const derived = question.targetDerived === true;
  const span =
    target === undefined || target <= 0
      ? null
      : target >= 60
        ? formatDuration(target)
        : `${target}s`;

  return (
    <ul className="task-chips">
      {question.domain && <li className="task-chip task-chip-domain">{question.domain}</li>}
      {pct !== null && (
        <li className="task-chip" title={strings.questionPanel.weightShareNote(pct)}>
          {strings.questionPanel.weightShare(pct)}
        </li>
      )}
      {span !== null && (
        <li
          className="task-chip"
          title={
            derived
              ? strings.questionPanel.targetTimeDerivedNote
              : strings.questionPanel.targetTimeNote
          }
        >
          {derived
            ? strings.questionPanel.targetTimeDerived(span)
            : strings.questionPanel.targetTime(span)}
          <span className="sr-only">
            {". "}
            {derived
              ? strings.questionPanel.targetTimeDerivedNote
              : strings.questionPanel.targetTimeNote}
          </span>
        </li>
      )}
      {question.instance && (
        <li className="task-chip instance-chip">{question.instance}</li>
      )}
    </ul>
  );
}

// Where the work happens. Drawn in the --machine-* palette — the dark
// family that is identical in both themes — because it is literally a
// computer: a command, and the one control that puts it on the machine's
// own clipboard. Nothing else in this pane may borrow those tokens; the
// rest of it is app surface.
function WorkFrom({ instance }: { instance: string }) {
  const command = strings.questionPanel.sshHint(instance);

  const copy = async () => {
    const outcome = await desktopClipboard.copy(command);
    toastStore.push({
      kind: outcome === "failed" ? "warning" : "info",
      message:
        outcome === "desktop"
          ? strings.questionPanel.copiedToDesktop(command, pasteChordLabel())
          : outcome === "browser"
            ? strings.questionPanel.copied(command)
            : strings.questionPanel.copyFailed,
      dedupeKey: "copy-value",
    });
  };

  return (
    <div className="work-from">
      <div className="work-from-head">
        <span className="work-from-label">{strings.questionPanel.workFrom}</span>
        <button
          type="button"
          className="work-from-copy"
          onClick={copy}
          aria-label={strings.questionPanel.copyValue(command)}
        >
          <Icon name="copy" />
          {strings.questionPanel.copyShort}
        </button>
      </div>
      <code className="work-from-command">{command}</code>
      <p className="work-from-note">{strings.questionPanel.workFromNote}</p>
    </div>
  );
}

// What the grader will actually look at, at the foot of the task text.
//
// The bank does not publish its check descriptions before grading (they
// arrive with the results, in `CheckResult.desc`), so this says the two
// things that are true of every task in the product rather than inventing
// a per-task summary: grading reads the state you leave behind, and this
// is what the task is worth. See the report — a `gradedOn` field on the
// bank spec would let this print the real thing.
function GradedOn({ question }: { question: ExamQuestionInfo }) {
  const points = strings.questionPanel.points(question.totalPoints);
  return (
    <section className="graded-on" aria-label={strings.questionPanel.gradedOn}>
      <span className="graded-on-label">{strings.questionPanel.gradedOn}</span>
      <p className="graded-on-body">
        {question.instance
          ? strings.questionPanel.gradedOnBody(points, question.instance)
          : strings.questionPanel.gradedOnBodyNoHost(points)}
      </p>
    </section>
  );
}

// Shaped like a question: a title, then two short paragraphs of steps. A
// generic grey box would say "empty"; this says "text is coming, about this
// much of it", which is what still reads correctly once the pulse is off
// under prefers-reduced-motion.
function QuestionSkeleton() {
  return (
    <div className="question-skeleton">
      <span className="sr-only">{strings.questionPanel.loading}</span>
      <Skeleton className="question-skeleton-title" width="80%" />
      <Skeleton width="100%" />
      <Skeleton width="92%" />
      <Skeleton width="64%" />
      <Skeleton className="question-skeleton-gap" width="100%" />
      <Skeleton width="88%" />
    </div>
  );
}

/**
 * The panel's questions as the shared navigator wants them.
 *
 * The tile prints the bank id, because that is what this screen's own
 * navigator trigger names the question — the mcq screen is the one that
 * must not (see McqExam.tsx). Everything the old four-per-row grid drew on
 * the tile — the bank's title, the domain, the instance, the points —
 * moves into the spoken detail: at ten tiles to a row there is one line,
 * and it belongs to the number.
 */
function toNavigator(questions: ExamQuestionInfo[]): NavigatorQuestion[] {
  return questions.map((q) => ({
    id: q.id,
    label: q.id,
    detail: [q.title, q.domain, q.instance, strings.questionPanel.points(q.totalPoints)]
      .filter(Boolean)
      .join(", "),
    // "viewed" is the only thing this screen can observe. It is NOT an
    // answer, and marksStore.ts is explicit that it may never be rendered
    // as one; the navigator's `progress="opened"` picks the words.
    done: marksStore.isViewed(q.id),
  }));
}
