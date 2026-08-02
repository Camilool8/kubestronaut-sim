import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getQuestion, type ExamQuestionInfo, type SessionMode } from "../api";
import { useAsync } from "../lib/useAsync";
import { strings } from "../strings";
import { Async } from "./Async";
import { Icon } from "./Icon";
import { Markdown } from "./Markdown";
import { HintTray } from "./HintTray";
import { Navigator, type NavigatorQuestion } from "./Navigator";
import { Skeleton } from "./Pending";
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

// The collapsible left panel. Its whole job is the question text: the
// candidate reads it in a 360px column, beside a terminal, under a clock
// that cannot be paused.
//
// Navigation used to be a scrolling list capped at 45% of the panel — 22
// questions showing 8 at a time, each row an id, a points pill and a domain
// string up to 50 characters ellipsed down to about eight. Half the panel
// bought a truncated non-word. It is now a one-row header (prev, current,
// next) plus Navigator, the shared disclosure that overlays the panel with
// every question at once.
//
// Navigator is absolutely positioned INSIDE .question-panel, which is
// already position: relative. That is load-bearing rather than incidental:
// opening it changes no flex geometry, so .desktop-pane never resizes, so
// noVNC's ResizeObserver never fires. See the comment at the top of
// Navigator.tsx for the rest of it.
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

  // [ and ] step between questions, G opens and closes the navigator.
  // Deliberately not Alt+arrows: those are Back/Forward on Windows and
  // Linux, and in a no-router SPA Back navigates out of a running exam.
  // Bare keys are safe because the handler below bows out over the desktop
  // canvas, over any focused form control, and while a dialog is open —
  // the product does have form controls (the mode picker, the clipboard
  // textarea, the keyboard checkboxes).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      // The RFB canvas owns the keyboard while focused, correctly — the
      // candidate is typing into a terminal.
      if (target?.closest(".desktop-pane")) return;
      if (target?.closest("input, textarea, [contenteditable]")) return;
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
      if (event.key !== "[" && event.key !== "]") return;
      const step = event.key === "[" ? prev : next;
      if (!step) return;
      event.preventDefault();
      onSelect(step.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [prev, next, onSelect]);

  const closeJump = (returnFocus: boolean) => {
    setJumpOpen(false);
    if (returnFocus) jumpTriggerRef.current?.focus();
  };

  const marked = selectedId !== null && marksStore.isMarked(selectedId);

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
          because 280px is where the nav row stops fitting. */}
      {questions.length === 0 && <div className="question-empty">{emptyState}</div>}
      {questions.length > 0 && (
        <>
          <header className="question-nav">
            <div className="question-nav-row">
              <button
                className="question-nav-step"
                onClick={() => prev && onSelect(prev.id)}
                disabled={!prev}
                aria-label={strings.questionPanel.prev}
              >
                <Icon name="chevron-left" />
              </button>
              <button
                ref={jumpTriggerRef}
                className="question-nav-current"
                onClick={() => setJumpOpen((v) => !v)}
                aria-expanded={jumpOpen}
                aria-controls={jumpOpen ? "question-jump" : undefined}
                disabled={!selected}
              >
                <span className="question-id">{selected?.id ?? "—"}</span>
                {selected && (
                  <span className="question-points">
                    {strings.questionPanel.points(selected.totalPoints)}
                  </span>
                )}
                <span className="question-nav-count" aria-hidden="true">
                  {index >= 0 ? `${index + 1} / ${questions.length}` : ""}
                </span>
                {/* The open/closed reading lives here now. It used to be an
                    accent border, which was the same declaration the current
                    question tile takes forty pixels below. */}
                <Icon name="chevron-down" className="disclosure-chevron" />
                <span className="sr-only">
                  {index >= 0
                    ? strings.navigator.position(index + 1, questions.length)
                    : strings.navigator.open}
                </span>
              </button>
              <button
                className="question-nav-step"
                onClick={() => next && onSelect(next.id)}
                disabled={!next}
                aria-label={strings.questionPanel.next}
              >
                <Icon name="chevron-right" />
              </button>
            </div>
            {selected && (
              <div className="question-nav-tools">
                {selected.title && <span className="question-nav-title">{selected.title}</span>}
                {selected.instance && (
                  <span className="instance-chip">
                    {strings.questionPanel.sshHint(selected.instance)}
                  </span>
                )}
                <button
                  className="question-mark"
                  onClick={() => marksStore.toggleMark(selected.id)}
                  aria-pressed={marked}
                >
<Icon name={marked ? "flag-filled" : "flag"} />
                  {strings.questionPanel.mark}
                </button>
              </div>
            )}
          </header>

          {/* aria-busy rather than blanking to "Loading…": a question fetch
              against a local facilitator normally lands in tens of
              milliseconds, and throwing away readable text for that long
              flashes the pane on every step between questions. The previous
              question stays up until the next one is ready. */}
          <div className="question-pane" ref={paneRef} aria-busy={question.status === "loading"}>
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
            {/* Inside the scrolling pane, below the question: a candidate
                reaching for a hint has just finished reading, and the
                tray should be where their eye already is. Keyed by id so
                moving question resets it rather than carrying a revealed
                hint across. */}
            {mode === "training" && selected && selected.hintCount > 0 && (
              <HintTray key={selected.id} questionId={selected.id} hintCount={selected.hintCount} />
            )}
          </div>

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
 * The tile prints the bank id, because that is what this screen's own nav
 * header names the question — the mcq screen is the one that must not (see
 * McqExam.tsx). Everything the old four-per-row grid drew on the tile —
 * the bank's title, the domain, the instance, the points — moves into the
 * spoken detail: at ten tiles to a row there is one line, and it belongs
 * to the number.
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
