import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import { DocsTray } from "./DocsTray";
import { HintTray } from "./HintTray";
import { Navigator, type NavigatorQuestion } from "./Navigator";
import { Skeleton } from "./Pending";
import { toastStore } from "./toastStore";
import { marksStore } from "./marksStore";

interface QuestionPanelProps {
  questions: ExamQuestionInfo[];
  selectedId: string | null;
  onSelect: (id: string) => void;

  emptyState?: ReactNode;

  mode?: SessionMode;
}

function QuestionPanelBody({
  questions,
  selectedId,
  onSelect,
  emptyState = null,
  mode,
}: QuestionPanelProps) {
  const [jumpOpen, setJumpOpen] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const jumpTriggerRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    if (!selectedId) return;
    marksStore.markViewed(selectedId);
    if (paneRef.current) paneRef.current.scrollTop = 0;
  }, [selectedId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;

      if (target?.closest(".desktop-pane")) return;
      if (isTypingTarget(target)) return;
      if (document.querySelector('[role="dialog"]')) return;

      if (event.key === "g" || event.key === "G") {
        event.preventDefault();
        setJumpOpen((open) => {
          if (open) jumpTriggerRef.current?.focus();
          return !open;
        });
        return;
      }

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

                  <kbd className="key-hint" aria-hidden="true">
                    {strings.questionPanel.markKey}
                  </kbd>
                </button>
              )}
            </div>

            {selected && (
              <h2 className="task-title">{selected.title ?? selected.id}</h2>
            )}
            {selected && <TaskChips question={selected} totalWeight={totalWeight} />}
          </header>

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

            {mode === "training" && selected && (selected.docsCount ?? 0) > 0 && (
              <DocsTray key={`docs-${selected.id}`} questionId={selected.id} />
            )}

            {mode === "training" && selected && selected.hintCount > 0 && (
              <HintTray key={selected.id} questionId={selected.id} hintCount={selected.hintCount} />
            )}
          </div>

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

// A session poll runs every 10 seconds and re-renders the whole exam with a
// fresh `fetchedAt`. Without this, react-markdown re-parsed the question body
// through remark, mdast and hast on every one of them, for the whole of a
// two-hour attempt. Exam keeps each prop referentially stable so the default
// shallow comparison actually holds.
export const QuestionPanel = memo(QuestionPanelBody);

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
    </div>
  );
}

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

function toNavigator(questions: ExamQuestionInfo[]): NavigatorQuestion[] {
  return questions.map((q, i) => ({
    id: q.id,

    label: String(i + 1).padStart(String(questions.length).length, "0"),
    detail: [q.title, q.domain, q.instance, strings.questionPanel.points(q.totalPoints)]
      .filter(Boolean)
      .join(", "),

    done: marksStore.isViewed(q.id),
  }));
}
