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
import { Async } from "../components/Async";
import { TimerBar } from "../components/TimerBar";
import { Dialog } from "../components/Dialog";
import { InfoButton } from "../components/InfoButton";
import { Icon } from "../components/Icon";
import { Markdown } from "../components/Markdown";
import { CheckList } from "../components/CheckList";
import { HintTray } from "../components/HintTray";
import { Navigator, type NavigatorQuestion } from "../components/Navigator";
import { Skeleton } from "../components/Pending";
import { toastStore } from "../components/toastStore";
import { marksStore } from "../components/marksStore";
import { strings } from "../strings";

interface McqExamProps {
  session: SessionSnapshot;
  fetchedAt: number;
  onSessionChange: (session: SessionSnapshot) => void;
}

// Option letters. Banks cap options at six (docs/bank-spec.md), so this
// never runs out.
const LETTERS = "ABCDEF";

// The multiple-choice exam screen: one question at a time in a single
// centred column — stem, options, navigation. No desktop, no clipboard
// bridge, no keymap translation; this is the one exam type that works on
// a phone, and the layout is single-column mobile-first because of it.
//
// Answers are server state, not component state. Every option click PUTs
// immediately (the session file is the answer sheet), and the map below
// is hydrated from GET /api/answers on mount so a reload — or a
// facilitator restart — resumes with every selection intact. The
// optimistic update exists so a click never waits a round-trip; a failed
// save reverts and says so, because an unsaved answer scores zero.
export function McqExam({ session, fetchedAt, onSessionChange }: McqExamProps) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [practice, setPractice] = useState<Results | null>(null);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});

  const examState = useAsync((signal) => getExam(signal), []);
  const exam = examState.data;

  // Resume: the server's stored selections are the truth this screen
  // starts from. Failure is non-fatal (the candidate can still answer —
  // each PUT stands alone) but must not be silent, since the screen
  // would show every question blank while the server holds answers.
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

  // Same per-attempt scoping the hands-on screen uses for viewed/marked.
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

  useEffect(() => {
    if (selectedId) marksStore.markViewed(selectedId);
  }, [selectedId]);

  // Which question is on screen, reported for the server's per-question
  // timing. Identical wiring to the hands-on screen, including that every
  // failure is a no-op: an older facilitator has no route to call, and
  // timing may never interrupt an attempt.
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void putFocus(selectedId, controller.signal).catch(() => {});
    return () => controller.abort();
  }, [selectedId]);

  // [ and ] step between questions, exactly like the hands-on panel —
  // minus its desktop-canvas guard, which has no counterpart here.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "[" && event.key !== "]") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      if (document.querySelector('[role="dialog"]')) return;
      const step = event.key === "[" ? prev : next;
      if (!step) return;
      event.preventDefault();
      setPickedId(step.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [prev, next]);

  const applySelection = useCallback(
    async (qid: string, selection: number[]) => {
      const previous = answers[qid] ?? [];
      // Optimistic: the click lands instantly. The server echo below
      // (sorted) or the revert on failure reconciles.
      setAnswers((a) => ({ ...a, [qid]: selection }));
      try {
        const result = await putAnswer(qid, selection);
        if (result.ok) {
          setAnswers((a) => ({ ...a, [qid]: result.selected }));
        } else {
          // 409: the attempt ended under us. The poller flips the screen
          // momentarily; meanwhile the truthful state is the old one.
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

  // Computed when the dialog opens, matching the hands-on screen's
  // reasoning: nobody is looking at these lists until then. Listed as
  // attempt positions (Q7), never bank ids — the ids are artifacts of
  // the pool this attempt was drawn from, and every other part of this
  // screen already says Q-numbers.
  const unansweredIds = confirmOpen
    ? questions
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => (answers[q.id] ?? []).length === 0)
        .map(({ i }) => strings.mcq.questionNumber(i + 1))
    : [];
  const markedIds = confirmOpen
    ? questions
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => marksStore.isMarked(q.id))
        .map(({ i }) => strings.mcq.questionNumber(i + 1))
    : [];

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
      <TimerBar
        session={session}
        fetchedAt={fetchedAt}
        title={exam?.title ?? strings.exam.fallbackTitle}
        onEndClick={() => setConfirmOpen(true)}
        extras={
          <>
            {questions.length > 0 && (
              <McqTally questions={questions} answeredCount={answeredCount} />
            )}
            {session.mode === "training" && (
              <button
                className="btn"
                onClick={() => void scoreNow()}
                disabled={scoring}
              >
                {scoring ? strings.practice.scoring : strings.practice.scoreNow}
              </button>
            )}
            <InfoButton />
          </>
        }
      />
      {/* The determinate rail under the topbar: answered out of the
          attempt's own length. aria-hidden, because the topbar tally
          beside it says the same three numbers in words — a bar that
          announces "37 percent" adds a second voice for one fact. */}
      <div className="mcq-rail" aria-hidden="true">
        <div
          className="mcq-rail-bar"
          style={{
            width: `${questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0}%`,
          }}
        />
      </div>
      <div className="mcq-body">
        {examState.status === "error" && (
          <div className="pane-error" role="alert">
            <p className="error-text">
              {strings.exam.questionsFailed(examState.error ?? "")}
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
            prev={prev}
            next={next}
            onSelect={setPickedId}
            onAnswer={applySelection}
            onEndExam={() => setConfirmOpen(true)}
          />
        )}
      </div>

      {confirmOpen && (
        <Dialog
          title={strings.exam.confirmTitle(session.mode)}
          onClose={() => setConfirmOpen(false)}
        >
          <p>{strings.mcq.confirmBody(session.mode)}</p>
          <div className="submit-review">
            {unansweredIds.length > 0 ? (
              <p>
                {strings.mcq.reviewUnanswered(unansweredIds.length)}{" "}
                <span className="submit-review-ids">
                  {unansweredIds.join(", ")}
                </span>
              </p>
            ) : (
              <p>{strings.mcq.allAnswered}</p>
            )}
            {markedIds.length > 0 && (
              <p>
                {strings.exam.reviewMarked(markedIds.length)}{" "}
                <span className="submit-review-ids">
                  {markedIds.join(", ")}
                </span>
              </p>
            )}
          </div>
          {endError && <p className="error-text">{endError}</p>}
          <div className="confirm-actions">
            <button
              className="btn"
              onClick={() => setConfirmOpen(false)}
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
              {/* Position, never the bank id — the id is an artifact of
                  the pool this attempt was drawn from. */}
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
  prev?: ExamQuestionInfo;
  next?: ExamQuestionInfo;
  onSelect: (id: string) => void;
  onAnswer: (qid: string, selection: number[]) => void;
  onEndExam: () => void;
}

// One question: head row, stem, options, footer. Keyed by question id from
// the parent, so per-question state (the training reveal) resets on step.
function McqQuestion({
  info,
  index,
  total,
  questions,
  answers,
  selectedId,
  mode,
  prev,
  next,
  onSelect,
  onAnswer,
  onEndExam,
}: McqQuestionProps) {
  const [jumpOpen, setJumpOpen] = useState(false);
  const jumpTriggerRef = useRef<HTMLButtonElement>(null);
  useSyncExternalStore(marksStore.subscribe, marksStore.getVersion);

  const load = useCallback(
    (signal: AbortSignal) => getQuestion(info.id, signal),
    [info.id],
  );
  const question = useAsync(load, [info.id]);

  const selection = answers[info.id] ?? [];
  const marked = marksStore.isMarked(info.id);

  const toggleOption = (optionIndex: number) => {
    if (info.multi) {
      const next = selection.includes(optionIndex)
        ? selection.filter((n) => n !== optionIndex)
        : [...selection, optionIndex].sort((a, b) => a - b);
      onAnswer(info.id, next);
    } else {
      // Radio semantics, plus deselect on re-click: "I want to leave
      // this blank after all" must stay reachable.
      onAnswer(info.id, selection.includes(optionIndex) ? [] : [optionIndex]);
    }
  };

  const closeJump = (returnFocus: boolean) => {
    setJumpOpen(false);
    if (returnFocus) jumpTriggerRef.current?.focus();
  };

  // G opens and closes the navigator and F flags the question on screen,
  // the same two bindings the hands-on panel carries — minus its
  // desktop-canvas guard, which has no counterpart here, exactly like the
  // [ and ] handler in the parent.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (event.key === "g" || event.key === "G") {
        event.preventDefault();
        setJumpOpen((open) => {
          if (open) jumpTriggerRef.current?.focus();
          return !open;
        });
        return;
      }
      // While the navigator is open it owns F, for the tile under the
      // cursor rather than the question behind it.
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
      {/* One row above the stem: where you are, what it is about, and the
          flag. Navigation is not here — it is the footer's, at the end of
          the reading, where the answer has just been picked. */}
      <header className="mcq-head">
        <span className="mcq-counter">
          {strings.mcq.questionCounter(index + 1, total)}
        </span>
        {/* The domain: the one per-question fact an mcq candidate can use,
            where the hands-on screen shows the ssh host. */}
        <span className="mcq-domain">{info.domain}</span>
        <button
          className="question-mark"
          onClick={() => marksStore.toggleMark(info.id)}
          aria-pressed={marked}
        >
          <Icon name={marked ? "flag-filled" : "flag"} />
          {strings.questionPanel.mark}
          <kbd className="key-hint" aria-hidden="true">
            {strings.questionPanel.markKey}
          </kbd>
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
              <Markdown>{data.markdown}</Markdown>
              <fieldset className="mcq-options">
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
                        type="checkbox"
                        name={`answer-${info.id}`}
                        checked={checked}
                        onChange={() => toggleOption(i)}
                      />
                      <span className="mcq-option-letter" aria-hidden="true">
                        {LETTERS[i]}
                      </span>
                      <span className="mcq-option-text">
                        <span className="sr-only">{LETTERS[i]}. </span>
                        {text}
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

      {/* Previous / the reassurance line / navigator + next. The middle
          span is not decoration: this is the one engine where the answer
          is saved the instant it is clicked and nothing is marked until
          submit, and a candidate who does not know that either re-clicks
          or hesitates. End Exam replaces Next on the last question and
          opens the same confirm dialog the topbar's does — the
          unanswered/marked review lives there once, not twice. */}
      <footer className="mcq-footer">
        <button
          className="btn"
          onClick={() => prev && onSelect(prev.id)}
          disabled={!prev}
          aria-label={strings.questionPanel.prev}
        >
          <Icon name="chevron-left" />
          {strings.questionPanel.prevShort}
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
            <Icon name="chevron-down" className="disclosure-chevron" />
            {strings.mcq.navigator}
            <kbd className="key-hint" aria-hidden="true">
              {strings.navigator.keyGridKey}
            </kbd>
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
          questions={toNavigator(questions, answers)}
          selectedId={selectedId}
          // "answered" is a fact here, not a guess: the answers are server
          // state this screen holds a copy of.
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

// The attempt's state in three numbers, in the topbar.
//
// Its own component so the marks subscription lives here rather than on
// the screen: flagging a question would otherwise re-render the whole
// engine, including the question fetch's Async wrapper. Answered is a
// server fact the parent already holds; flagged and unseen are this
// attempt's own scratch marks.
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
    <span className="mcq-tally">
      {strings.mcq.tally(answeredCount, flagged, unseen)}
    </span>
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

// Training-mode reveal: the same 403-gated solution endpoint the score
// screen uses, shown inline as a disclosure. In an mcq bank solution.md
// is the explanation — correct answer plus why each distractor is wrong.
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
      {solution && <Markdown>{solution.markdown}</Markdown>}
    </details>
  );
}

/**
 * This screen's questions as the shared navigator wants them.
 *
 * The tile prints the attempt position, never the bank id — q61 is an
 * artifact of the 97-question pool a random draw sampled from, and it is
 * non-sequential and meaningless to whoever is sitting the exam. Every
 * other mcq surface already says Q-numbers: the nav badge, the submit
 * dialog's unanswered list, the practice dialog.
 */
function toNavigator(
  questions: ExamQuestionInfo[],
  answers: Record<string, number[]>,
): NavigatorQuestion[] {
  return questions.map((q, i) => ({
    id: q.id,
    label: strings.mcq.questionNumber(i + 1),
    // The domain is the one per-question fact an mcq candidate can use,
    // and the same one the nav header shows for the current question.
    detail: q.domain,
    done: (answers[q.id] ?? []).length > 0,
  }));
}
