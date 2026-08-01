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
  // reasoning: nobody is looking at these lists until then.
  const unansweredIds = confirmOpen
    ? questions
        .filter((q) => (answers[q.id] ?? []).length === 0)
        .map((q) => q.id)
    : [];
  const markedIds = confirmOpen
    ? questions.filter((q) => marksStore.isMarked(q.id)).map((q) => q.id)
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
            answeredCount={answeredCount}
            onEndExam={() => setConfirmOpen(true)}
          />
        )}
      </div>

      {confirmOpen && (
        <Dialog
          title={strings.exam.confirmTitle}
          onClose={() => setConfirmOpen(false)}
        >
          <p>{strings.mcq.confirmBody}</p>
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
              {ending ? strings.exam.ending : strings.exam.endExam}
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
          {practice.questions.map((q) => (
            <details key={q.id} className="score-question">
              <summary>
                {q.id} — {q.earned}/{q.total}
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
  answeredCount: number;
  onEndExam: () => void;
}

// One question: nav row, stem, options. Keyed by question id from the
// parent, so per-question state (the training reveal) resets on step.
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
  answeredCount,
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

  return (
    <section className="mcq-question" aria-label={strings.mcq.regionLabel}>
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
            aria-controls={jumpOpen ? "mcq-jump" : undefined}
          >
            <span className="question-id">
              {strings.mcq.questionNumber(index + 1)}
            </span>
            <span className="question-points">
              {strings.questionPanel.points(info.totalPoints)}
            </span>
            <Icon name="chevron-down" className="disclosure-chevron" />
            <span className="sr-only">
              {strings.questionPanel.position(index + 1, total)}
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
        <div className="question-nav-tools">
          {info.title && <span className="question-nav-title">{info.title}</span>}
          {/* The domain, where the hands-on screen shows the ssh chip —
              the one per-question fact an mcq candidate can use. */}
          <span className="instance-chip">{info.domain}</span>
          {/* Position, not answered count: this sits directly under the
              nav row's own position badge, and a DIFFERENT number here
              (the old answered-count) read as a second, conflicting
              "which question am I on" — most confusing right after
              stepping back to an earlier question. Answered-count still
              lives in the footer, away from anything claiming to be a
              position. */}
          <span className="mcq-progress" aria-hidden="true">
            {index + 1} / {total}
          </span>
          <button
            className="question-mark"
            onClick={() => marksStore.toggleMark(info.id)}
            aria-pressed={marked}
          >
            <Icon name={marked ? "flag-filled" : "flag"} />
            {strings.questionPanel.mark}
          </button>
        </div>
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

      {/* A labelled Previous/Next/End Exam row, distinct from the header's
          compact icon steppers: those exist for a quick keyboard-adjacent
          nudge, this is the discoverable, exam-shaped control a candidate
          expects at the foot of a question. End Exam here opens the same
          confirm dialog as the header button — the unanswered/marked
          review lives there once, not twice. */}
      <footer className="mcq-footer">
        <button
          className="btn"
          onClick={() => prev && onSelect(prev.id)}
          disabled={!prev}
        >
          <Icon name="chevron-left" />
          {strings.mcq.previous}
        </button>
        <span className="mcq-progress" aria-hidden="true">
          {answeredCount} / {total} completed
        </span>
        {next ? (
          <button className="btn" onClick={() => onSelect(next.id)}>
            {strings.mcq.next}
            <Icon name="chevron-right" />
          </button>
        ) : (
          <button className="btn btn-primary" onClick={onEndExam}>
            {strings.exam.endExam}
          </button>
        )}
      </footer>

      {jumpOpen && (
        <McqJump
          questions={questions}
          answers={answers}
          selectedId={selectedId}
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

interface McqJumpProps {
  questions: ExamQuestionInfo[];
  answers: Record<string, number[]>;
  selectedId: string;
  onSelect: (id: string) => void;
  onDismiss: () => void;
}

// Every question at once, grouped by domain, with the one state the
// hands-on grid cannot have: answered/unanswered, which here the UI
// genuinely knows — the answers are server state it holds a copy of.
function McqJump({
  questions,
  answers,
  selectedId,
  onSelect,
  onDismiss,
}: McqJumpProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('[aria-current="true"]')
      ?.focus({ preventScroll: true });
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

  const groups = useMemo(() => {
    const byDomain = new Map<string, ExamQuestionInfo[]>();
    const order: string[] = [];
    for (const q of questions) {
      if (!byDomain.has(q.domain)) {
        byDomain.set(q.domain, []);
        order.push(q.domain);
      }
      byDomain.get(q.domain)?.push(q);
    }
    return order.map((domain) => ({
      domain,
      questions: byDomain.get(domain) ?? [],
    }));
  }, [questions]);

  // The tile's own sequence position (1-65), not its bank id — same
  // reasoning as the nav badge above: q.id is an artifact of the pool a
  // random draw sampled from, not something the candidate should see.
  const positionOf = useMemo(() => {
    const m = new Map<string, number>();
    questions.forEach((q, i) => m.set(q.id, i + 1));
    return m;
  }, [questions]);

  // Tiles widen as a set, not per question — same rule as the hands-on
  // jump grid. Today no mcq bank ships titles, so this stays compact.
  const titled = questions.some((q) => q.title);

  return (
    <div className="question-jump mcq-jump" id="mcq-jump" ref={ref}>
      {groups.map((group) => (
        <div className="question-jump-group" key={group.domain}>
          <h2>{group.domain}</h2>
          <ul className={`question-grid${titled ? " question-grid-titled" : ""}`}>
            {group.questions.map((q) => {
              const current = q.id === selectedId;
              const answered = (answers[q.id] ?? []).length > 0;
              const marked = marksStore.isMarked(q.id);
              return (
                <li key={q.id}>
                  <button
                    className={`question-tile${answered ? " answered" : ""}`}
                    onClick={() => onSelect(q.id)}
                    aria-current={current ? "true" : undefined}
                  >
                    <span className="question-tile-id">
                      {strings.mcq.questionNumber(positionOf.get(q.id) ?? 0)}
                    </span>
                    {answered && (
                      <Icon name="check" className="question-tile-answered" />
                    )}
                    {q.title && <span className="question-tile-title">{q.title}</span>}
                    {marked && (
                      <Icon name="flag-filled" className="question-tile-mark" />
                    )}
                    <span className="sr-only">
                      {[
                        answered
                          ? strings.mcq.answered
                          : strings.mcq.unanswered,
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
