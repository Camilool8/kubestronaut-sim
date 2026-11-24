import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  endSession,
  getAnswers,
  getExam,
  getQuestion,
  getSolution,
  practiceGrade,
  putAnswer,
  putFocus,
  type ExamQuestionInfo,
  type Results,
  type SessionSnapshot,
  type SolutionDetail,
} from "../api";
import { useAsync } from "../lib/useAsync";
import { isTypingTarget } from "../lib/typing";
import { singleKeyShortcuts, useSingleKeyShortcuts } from "../lib/singleKeyShortcuts";
import { useHostedDeployment } from "../lib/deployment";
import { MCQ_COMPACT_QUERY, useMediaQuery } from "../lib/useMediaQuery";
import { Async } from "../components/Async";
import { TimerBar } from "../components/TimerBar";
import { NavMenuFact, NavMenuItem } from "../components/NavMenu";
import { Dialog } from "../components/Dialog";
import { KeyboardSettings } from "../components/KeyboardSettings";
import { Icon } from "../components/Icon";
import { InlineCode, Markdown } from "../components/Markdown";
import { CheckList } from "../components/CheckList";
import { HintTray } from "../components/HintTray";
import { Navigator, type NavigatorQuestion } from "../components/Navigator";
import { ShortcutHelp } from "../components/ShortcutHelp";
import { SubmitReview } from "../components/SubmitReview";
import { Skeleton } from "../components/Pending";
import { toastStore } from "../components/toastStore";
import { marksStore } from "../components/marksStore";
import { strings } from "../strings";

interface McqExamProps {
  session: SessionSnapshot;
  fetchedAt: number;
  onSessionChange: (session: SessionSnapshot) => void;
}

const LETTERS = "ABCDEF";

const OPTION_LETTER_KEYS = "ABCDE";

const NO_SELECTION: number[] = [];

function optionForKey(key: string, count: number): number | null {
  const letter = key.length === 1 ? OPTION_LETTER_KEYS.indexOf(key.toUpperCase()) : -1;
  const digit = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
  const index = letter >= 0 ? letter : digit;
  return index >= 0 && index < count ? index : null;
}

export function McqExam({ session, fetchedAt, onSessionChange }: McqExamProps) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [practice, setPractice] = useState<Results | null>(null);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const hosted = useHostedDeployment();
  const examState = useAsync((signal) => getExam(signal), []);
  const exam = examState.data;

  const compact = useMediaQuery(MCQ_COMPACT_QUERY);

  useEffect(() => {
    let stopped = false;
    getAnswers()
      .then((stored) => {
        if (!stopped) setAnswers(stored);
      })
      .catch((err) => {
        if (!stopped) {
          toastStore.push({
            kind: "warning",
            message: strings.mcq.saveFailed(String(err)),
            dedupeKey: "mcq-hydrate",
          });
        }
      });
    return () => {
      stopped = true;
    };
  }, []);

  useEffect(() => {
    marksStore.setScope(session.startedAt);
  }, [session.startedAt]);

  const questions = useMemo(() => exam?.questions ?? [], [exam]);
  const selectedId = pickedId ?? questions[0]?.id ?? null;
  const index = questions.findIndex((q) => q.id === selectedId);
  const selected = index === -1 ? undefined : questions[index];
  const prev = index > 0 ? questions[index - 1] : undefined;
  const next =
    index >= 0 && index < questions.length - 1
      ? questions[index + 1]
      : undefined;

  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);
  const goTo = useCallback(
    (id: string) => {
      if (id === selectedId) return;
      focusHeading.current = true;
      setPickedId(id);
    },
    [selectedId],
  );

  useEffect(() => {
    if (!focusHeading.current) return;
    focusHeading.current = false;
    headingRef.current?.focus();
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) marksStore.markViewed(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void putFocus(selectedId, controller.signal).catch(() => {});
    return () => controller.abort();
  }, [selectedId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "[" && event.key !== "]") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (!singleKeyShortcuts.enabled) return;
      const target = event.target as HTMLElement | null;
      if (isTypingTarget(target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const step = event.key === "[" ? prev : next;
      if (!step) return;
      event.preventDefault();
      goTo(step.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [prev, next, goTo]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "?") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (!singleKeyShortcuts.enabled) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      setHelpOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const applySelection = useCallback(
    async (qid: string, selection: number[]) => {
      const previous = answers[qid] ?? [];

      setAnswers((a) => ({ ...a, [qid]: selection }));
      try {
        const result = await putAnswer(qid, selection);
        if (result.ok) {
          setAnswers((a) => ({ ...a, [qid]: result.selected }));
        } else {
          setAnswers((a) => ({ ...a, [qid]: previous }));
          toastStore.push({
            kind: "warning",
            message: strings.mcq.saveConflict,
            dedupeKey: "mcq-save",
          });
        }
      } catch (err) {
        setAnswers((a) => ({ ...a, [qid]: previous }));
        toastStore.push({
          kind: "warning",
          message: strings.mcq.saveFailed(String(err)),
          dedupeKey: "mcq-save",
        });
      }
    },
    [answers],
  );

  const answeredCount = questions.filter(
    (q) => (answers[q.id] ?? []).length > 0,
  ).length;

  const reviewItem = (q: ExamQuestionInfo, i: number) => ({
    id: q.id,
    label: String(i + 1),
    jumpLabel: strings.exam.reviewJumpQuestion(i + 1),
  });
  const unansweredIds = confirmOpen
    ? questions.flatMap((q, i) =>
        (answers[q.id] ?? []).length === 0 ? [reviewItem(q, i)] : [],
      )
    : [];
  const markedIds = confirmOpen
    ? questions.flatMap((q, i) => (marksStore.isMarked(q.id) ? [reviewItem(q, i)] : []))
    : [];

  const closeConfirm = useCallback(() => setConfirmOpen(false), []);
  const jumpToQuestion = useCallback((id: string) => {
    setConfirmOpen(false);
    focusHeading.current = true;
    setPickedId(id);
  }, []);

  const handleConfirmEnd = async () => {
    setEnding(true);
    setEndError(null);
    try {
      const result = await endSession();
      if (result.ok) {
        setConfirmOpen(false);
        onSessionChange(result.session);
      } else {
        setEndError(result.error);
      }
    } catch (err) {
      setEndError(String(err));
    } finally {
      setEnding(false);
    }
  };

  const scoreNow = async () => {
    setScoring(true);
    try {
      const res = await practiceGrade();
      if (res.ok) {
        setPractice(res.results);
      } else {
        toastStore.push({
          kind: "warning",
          message: strings.practice.failed(res.error),
          dedupeKey: "practice-grade",
        });
      }
    } catch (err) {
      toastStore.push({
        kind: "warning",
        message: strings.practice.failed(String(err)),
        dedupeKey: "practice-grade",
      });
    } finally {
      setScoring(false);
    }
  };

  return (
    <div className="mcq-layout">
      <h1 className="sr-only">{exam?.title ?? strings.exam.fallbackTitle}</h1>
      <TimerBar
        session={session}
        fetchedAt={fetchedAt}
        title={exam?.title ?? strings.exam.fallbackTitle}
        onEndClick={() => setConfirmOpen(true)}
        status={
          questions.length > 0 && (
            <span className="exam-progress-text mcq-answered">
              {compact ? (
                <>
                  <span aria-hidden="true">{strings.mcq.answeredShort(answeredCount)}</span>
                  <span className="sr-only">
                    {strings.mcq.answeredCount(answeredCount, questions.length)}
                  </span>
                </>
              ) : (
                strings.mcq.answeredCount(answeredCount, questions.length)
              )}
            </span>
          )
        }
        extras={
          <>
            {questions.length > 0 && (
              <McqTally questions={questions} answeredCount={answeredCount} />
            )}
            {session.mode === "training" && (
              <NavMenuItem
                icon="check"
                label={scoring ? strings.practice.scoring : strings.practice.scoreNow}
                onSelect={() => void scoreNow()}
              />
            )}
            <NavMenuItem
              icon="keyboard"
              label={strings.focus.keyboardSettings}
              onSelect={() => setKeyboardOpen(true)}
            />
          </>
        }
      />

      <div className="mcq-rail" aria-hidden="true">

        <div
          className="mcq-rail-bar"
          style={{
            transform: `scaleX(${questions.length > 0 ? answeredCount / questions.length : 0})`,
          }}
        />
      </div>
      <div className="mcq-body">
        {examState.status === "error" && (
          <div className="pane-error" role="alert">
            <p className="error-text">
              {strings.exam.questionsFailed(examState.error ?? "", hosted)}
            </p>
            <button className="btn" onClick={examState.reload}>
              {strings.questionPanel.retry}
            </button>
          </div>
        )}
        {examState.status !== "error" && questions.length === 0 && (
          <p className="question-empty-note">{strings.exam.loadingQuestions}</p>
        )}
        {selected && (
          <McqQuestion
            key={selected.id}
            info={selected}
            index={index}
            total={questions.length}
            questions={questions}
            answers={answers}
            selectedId={selected.id}
            mode={session.mode}
            compact={compact}
            prev={prev}
            next={next}
            headingRef={headingRef}
            onSelect={goTo}
            onAnswer={applySelection}
            onEndExam={() => setConfirmOpen(true)}
          />
        )}
      </div>

      {keyboardOpen && (
        <KeyboardSettings
          onClose={() => setKeyboardOpen(false)}
          onShowHelp={() => {
            setKeyboardOpen(false);
            setHelpOpen(true);
          }}
        />
      )}

      {confirmOpen && (
        <Dialog
          title={strings.exam.confirmTitle(session.mode)}
          onClose={closeConfirm}
        >
          <p>{strings.mcq.confirmBody(session.mode)}</p>
          <SubmitReview
            session={session}
            fetchedAt={fetchedAt}
            groups={[
              {
                key: "unanswered",
                heading: strings.mcq.reviewUnanswered(unansweredIds.length),
                items: unansweredIds,
              },
              {
                key: "marked",
                heading: strings.exam.reviewQuestionsMarked(markedIds.length),
                items: markedIds,
              },
            ]}
            note={unansweredIds.length === 0 ? strings.mcq.allAnswered : undefined}
            onJump={jumpToQuestion}
          />
          {endError && <p className="error-text">{endError}</p>}
          <div className="confirm-actions">
            <button
              className="btn"
              onClick={closeConfirm}
              disabled={ending}
            >
              {strings.exam.cancel}
            </button>
            <button
              className="btn btn-danger"
              onClick={handleConfirmEnd}
              disabled={ending}
            >
              {ending ? strings.exam.ending : strings.exam.endAttempt(session.mode)}
            </button>
          </div>
        </Dialog>
      )}

      {helpOpen && (
        <ShortcutHelp
          onClose={() => setHelpOpen(false)}
          shortcuts={strings.keyboard.mcqShortcuts}
          desktop={false}
        />
      )}

      {practice && (
        <Dialog
          title={strings.practice.title}
          onClose={() => setPractice(null)}
          wide
        >
          <p className="score-headline">
            {practice.earned} / {practice.total} ({practice.percent}%)
          </p>
          <p className="control-hint">{strings.practice.note}</p>
          {practice.questions.map((q, i) => (
            <details key={q.id} className="score-question">

              <summary>
                {strings.practice.questionScore(strings.mcq.questionNumber(i + 1), q.earned, q.total)}
              </summary>
              <CheckList checks={q.checks} />
            </details>
          ))}
          <div className="control-actions">
            <button className="btn" onClick={() => setPractice(null)}>
              {strings.practice.close}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

interface McqQuestionProps {
  info: ExamQuestionInfo;
  index: number;
  total: number;
  questions: ExamQuestionInfo[];
  answers: Record<string, number[]>;
  selectedId: string;
  mode: SessionSnapshot["mode"];

  compact: boolean;
  prev?: ExamQuestionInfo;
  next?: ExamQuestionInfo;
  headingRef: React.RefObject<HTMLHeadingElement>;
  onSelect: (id: string) => void;
  onAnswer: (qid: string, selection: number[]) => void;
  onEndExam: () => void;
}

function McqQuestion({
  info,
  index,
  total,
  questions,
  answers,
  selectedId,
  mode,
  compact,
  prev,
  next,
  headingRef,
  onSelect,
  onAnswer,
  onEndExam,
}: McqQuestionProps) {
  const [jumpOpen, setJumpOpen] = useState(false);
  const jumpTriggerRef = useRef<HTMLButtonElement>(null);
  useSyncExternalStore(marksStore.subscribe, marksStore.getVersion);
  const singleKeys = useSingleKeyShortcuts();

  const load = useCallback(
    (signal: AbortSignal) => getQuestion(info.id, signal),
    [info.id],
  );
  const question = useAsync(load, [info.id]);

  const selection = answers[info.id] ?? NO_SELECTION;
  const marked = marksStore.isMarked(info.id);

  const toggleOption = useCallback(
    (optionIndex: number) => {
      if (info.multi) {
        const next = selection.includes(optionIndex)
          ? selection.filter((n) => n !== optionIndex)
          : [...selection, optionIndex].sort((a, b) => a - b);
        onAnswer(info.id, next);
        return;
      }
      // A pick replaces a pick. Clearing back to unanswered existed only
      // because this was a checkbox; a radio has no such gesture, and the
      // real exam has none either.
      onAnswer(info.id, [optionIndex]);
    },
    [info.id, info.multi, selection, onAnswer],
  );

  const optionCount = question.data?.options?.length ?? 0;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (event.defaultPrevented || jumpOpen) return;
      if (!singleKeyShortcuts.enabled) return;
      const target = event.target as HTMLElement | null;
      if (isTypingTarget(target) || target?.closest(".navigator")) return;
      if (document.querySelector('[role="dialog"]')) return;
      const optionIndex = optionForKey(event.key, optionCount);
      if (optionIndex === null) return;
      event.preventDefault();
      toggleOption(optionIndex);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [optionCount, jumpOpen, toggleOption]);

  const closeJump = (returnFocus: boolean) => {
    setJumpOpen(false);
    if (returnFocus) jumpTriggerRef.current?.focus();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (!singleKeyShortcuts.enabled) return;
      const target = event.target as HTMLElement | null;
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
        event.preventDefault();
        marksStore.toggleMark(info.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [info.id, jumpOpen]);

  return (
    <section className="mcq-question" aria-label={strings.mcq.regionLabel}>

      <header className="mcq-head">
        <h2 className="mcq-counter" ref={headingRef} tabIndex={-1}>
          <span aria-hidden="true">{strings.mcq.questionCounter(index + 1, total)}</span>
          <span className="sr-only">{strings.focus.questionAnnounce(index + 1, total)}</span>
        </h2>

        <span className="mcq-domain">{info.domain}</span>
        <button
          className="question-mark"
          onClick={() => marksStore.toggleMark(info.id)}
          aria-pressed={marked}
        >
          <Icon name={marked ? "flag-filled" : "flag"} />
          {strings.questionPanel.mark}
          {singleKeys && (
            <kbd className="key-hint" aria-hidden="true">
              {strings.questionPanel.markKey}
            </kbd>
          )}
        </button>
      </header>

      <div className="mcq-pane" aria-busy={question.status === "loading"}>
        <Async
          state={question}
          loading={<McqSkeleton />}
          error={(message, reload) => (
            <div className="pane-error" role="alert">
              <p className="error-text">
                {strings.questionPanel.loadFailed(message)}
              </p>
              <button className="btn" onClick={reload}>
                {strings.questionPanel.retry}
              </button>
            </div>
          )}
        >
          {(data) => (
            <>

              <Markdown copyable={false} headingLevel={3}>{data.markdown}</Markdown>
              <fieldset className="mcq-options" data-multi={info.multi ? "" : undefined}>
                <legend>
                  {info.multi ? strings.mcq.selectAll : strings.mcq.selectOne}
                </legend>
                {(data.options ?? []).map((text, i) => {
                  const checked = selection.includes(i);
                  return (
                    <label
                      key={i}
                      className={`mcq-option${checked ? " mcq-option-on" : ""}`}
                    >
                      <input
                        type={info.multi ? "checkbox" : "radio"}
                        name={`answer-${info.id}`}
                        checked={checked}
                        onChange={() => toggleOption(i)}
                      />
                      <span className="mcq-option-letter" aria-hidden="true">
                        {LETTERS[i]}
                      </span>
                      <span className="mcq-option-text">
                        <span className="sr-only">{LETTERS[i]}. </span>
                        <InlineCode text={text} />
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              {mode === "training" && <McqCheckAnswer questionId={info.id} />}
              {mode === "training" && info.hintCount > 0 && (
                <HintTray
                  key={info.id}
                  questionId={info.id}
                  hintCount={info.hintCount}
                />
              )}
            </>
          )}
        </Async>
      </div>

      <footer className="mcq-footer">
        <button
          className="btn"
          onClick={() => prev && onSelect(prev.id)}
          disabled={!prev}
          aria-label={strings.questionPanel.prev}
        >
          <Icon name="chevron-left" />
          {!compact && strings.questionPanel.prevShort}
        </button>
        <span className="mcq-save-note">{strings.mcq.saveNote}</span>
        <div className="mcq-footer-end">
          <button
            ref={jumpTriggerRef}
            className="btn mcq-jump-trigger"
            onClick={() => setJumpOpen((v) => !v)}
            aria-expanded={jumpOpen}
            aria-controls={jumpOpen ? "mcq-jump" : undefined}
          >
            <Icon name="grid" className="trigger-glyph" />
            {compact ? (
              <span className="mcq-jump-position" aria-hidden="true">
                {strings.exam.positionShort(index + 1, total)}
              </span>
            ) : (
              <>
                {strings.mcq.navigator}
                {singleKeys && (
                  <kbd className="key-hint" aria-hidden="true">
                    {strings.navigator.keyGridKey}
                  </kbd>
                )}
              </>
            )}
            <span className="sr-only">
              {strings.navigator.position(index + 1, total)}
            </span>
          </button>
          {next ? (
            <button
              className="btn btn-primary"
              onClick={() => onSelect(next.id)}
              aria-label={strings.questionPanel.next}
            >
              {strings.questionPanel.nextShort}
              <Icon name="chevron-right" />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={onEndExam}>
              {strings.exam.endAttempt(mode)}
            </button>
          )}
        </div>
      </footer>

      {jumpOpen && (
        <Navigator
          id="mcq-jump"
          asSheet={compact}
          questions={toNavigator(questions, answers)}
          selectedId={selectedId}

          progress="answered"
          onSelect={(id) => {
            onSelect(id);
            closeJump(true);
          }}
          onDismiss={() => closeJump(true)}
        />
      )}
    </section>
  );
}

function McqTally({
  questions,
  answeredCount,
}: {
  questions: ExamQuestionInfo[];
  answeredCount: number;
}) {
  useSyncExternalStore(marksStore.subscribe, marksStore.getVersion);

  const flagged = questions.filter((q) => marksStore.isMarked(q.id)).length;
  const unseen = questions.filter((q) => !marksStore.isViewed(q.id)).length;

  return (
    <NavMenuFact
      icon="grid"
      label={strings.mcq.answeredLabel}
      detail={strings.mcq.tally(answeredCount, flagged, unseen)}
    />
  );
}

function McqSkeleton() {
  return (
    <div className="question-skeleton">
      <span className="sr-only">{strings.questionPanel.loading}</span>
      <Skeleton className="question-skeleton-title" width="85%" />
      <Skeleton width="100%" />
      <Skeleton width="70%" />
      <Skeleton className="question-skeleton-gap" width="55%" />
      <Skeleton width="55%" />
      <Skeleton width="55%" />
      <Skeleton width="55%" />
    </div>
  );
}

function McqCheckAnswer({ questionId }: { questionId: string }) {
  const [solution, setSolution] = useState<SolutionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const handleToggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open || fetched) return;
    setFetched(true);
    setLoading(true);
    getSolution(questionId)
      .then((r) => {
        if (r.ok) {
          setSolution(r.solution);
        } else {
          setError(r.error);
        }
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  return (
    <details
      className="solution-details mcq-check-answer"
      onToggle={handleToggle}
    >
      <summary>
        <Icon name="chevron-down" className="disclosure-chevron" />
        {strings.mcq.checkAnswer}
      </summary>
      {loading && <p>{strings.mcq.loadingAnswer}</p>}
      {error && <p className="error-text">{error}</p>}
      {solution && <Markdown copyable={false} headingLevel={3}>{solution.markdown}</Markdown>}
    </details>
  );
}

function toNavigator(
  questions: ExamQuestionInfo[],
  answers: Record<string, number[]>,
): NavigatorQuestion[] {
  return questions.map((q, i) => ({
    id: q.id,
    label: strings.mcq.questionNumber(i + 1),

    detail: q.domain,
    reached: (answers[q.id] ?? []).length > 0,
  }));
}
