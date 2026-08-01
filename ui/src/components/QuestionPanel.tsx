import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getQuestion, type ExamQuestionInfo, type SessionMode } from "../api";
import { useAsync } from "../lib/useAsync";
import { strings } from "../strings";
import { Async } from "./Async";
import { Icon } from "./Icon";
import { Markdown } from "./Markdown";
import { HintTray } from "./HintTray";
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
// bought a truncated non-word. It is now a one-row navigator (prev, current,
// next) plus a disclosure that overlays the panel with every question at
// once, grouped by domain, where the long strings finally have a full line.
//
// The disclosure is absolutely positioned INSIDE .question-panel, which is
// already position: relative. That is load-bearing rather than incidental:
// opening it changes no flex geometry, so .desktop-pane never resizes, so
// noVNC's ResizeObserver never fires. It is also why this is a disclosure
// and not a modal — no scrim, no role="dialog", no focus trap. Dimming a
// live remote desktop to pick question 12 would read as something going
// wrong.
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

  // [ and ] step between questions. Deliberately not Alt+arrows: those are
  // Back/Forward on Windows and Linux, and in a no-router SPA Back navigates
  // out of a running exam. Bare bracket keys are safe because the handler
  // below bows out over the desktop canvas, over any focused form control,
  // and while a dialog is open — the product does have form controls (the
  // mode picker, the clipboard textarea, the keyboard checkboxes).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "[" && event.key !== "]") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      // The RFB canvas owns the keyboard while focused, correctly — the
      // candidate is typing into a terminal.
      if (target?.closest(".desktop-pane")) return;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      if (document.querySelector('[role="dialog"]')) return;
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

  const groups = useMemo(() => groupByDomain(questions), [questions]);
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
                    ? strings.questionPanel.position(index + 1, questions.length)
                    : strings.questionPanel.jumpOpenLabel}
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
            <QuestionJump
              groups={groups}
              selectedId={selectedId}
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

interface DomainGroup {
  domain: string;
  questions: ExamQuestionInfo[];
}

// Grouped by domain in order of first appearance, so the grid mirrors the
// bank's own question order rather than sorting it into something the
// candidate has not seen before.
function groupByDomain(questions: ExamQuestionInfo[]): DomainGroup[] {
  const groups: DomainGroup[] = [];
  const byDomain = new Map<string, DomainGroup>();
  for (const question of questions) {
    let group = byDomain.get(question.domain);
    if (!group) {
      group = { domain: question.domain, questions: [] };
      byDomain.set(question.domain, group);
      groups.push(group);
    }
    group.questions.push(question);
  }
  return groups;
}

interface QuestionJumpProps {
  groups: DomainGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDismiss: () => void;
}

// Every question at once. Four ~76px tiles per row in the panel's 328px of
// inner width means 22 questions is six rows — less vertical space than the
// old list spent showing eight, and no scrolling to find where you are.
function QuestionJump({ groups, selectedId, onSelect, onDismiss }: QuestionJumpProps) {
  const ref = useRef<HTMLDivElement>(null);

  // A non-modal disclosure, so useFocusTrap is the wrong tool despite being
  // right next door: it cycles Tab inside the container, which would strand
  // a keyboard user who wanted to reach the timer or End Exam.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onDismiss();
    };
    const node = ref.current;
    node?.addEventListener("keydown", onKeyDown);
    return () => node?.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  // Tiles widen as a set, not per question: a grid mixing titled and
  // untitled widths would read as two different controls.
  const titled = groups.some((group) => group.questions.some((q) => q.title));

  return (
    <div className="question-jump" id="question-jump" ref={ref}>
      {groups.map((group) => (
        <div className="question-jump-group" key={group.domain}>
          {/* h2, matching the shifted level the question markdown now
              renders its own title at — the topbar owns the exam's h1. */}
          <h2>{group.domain}</h2>
          <ul className={`question-grid${titled ? " question-grid-titled" : ""}`}>
            {group.questions.map((q) => {
              const current = q.id === selectedId;
              const marked = marksStore.isMarked(q.id);
              const viewed = marksStore.isViewed(q.id);
              return (
                <li key={q.id}>
                  <button
                    className={`question-tile${viewed ? " viewed" : ""}`}
                    onClick={() => onSelect(q.id)}
                    aria-current={current ? "true" : undefined}
                  >
                    <span className="question-tile-id">{q.id}</span>
                    <span className="question-tile-points">
                      {strings.questionPanel.points(q.totalPoints)}
                    </span>
                    {q.title && <span className="question-tile-title">{q.title}</span>}
                    {marked && (
<Icon name="flag-filled" className="question-tile-mark" />
                    )}
                    <span className="sr-only">
                      {[
                        q.instance,
                        viewed ? strings.questionPanel.viewed : null,
                        marked ? strings.questionPanel.marked : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
