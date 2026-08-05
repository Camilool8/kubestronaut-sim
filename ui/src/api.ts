// Typed client for the facilitator's HTTP API. Every function fetches a
// relative path (never an absolute origin) so the built bundle works
// identically behind the Vite dev proxy and the production facilitator
// serving the SPA from the same origin as the API — see §3 of the
// milestone design doc for the exact JSON contract mirrored here.

export type SessionState = "idle" | "running" | "ended";

/** How an attempt is being run. Chosen at Start, immutable after. */
export type SessionMode = "exam" | "training" | "speed" | "";

export interface SessionSnapshot {
  state: SessionState;
  bank: string;
  startedAt: string;
  durationSeconds: number;
  remainingSeconds: number;
  endReason: string;
  mode: SessionMode;
  /**
   * True for a training attempt. Branch on this, never on
   * remainingSeconds === 0 — that is also what an expired attempt looks
   * like, and the two must not render the same.
   */
  untimed: boolean;
  /**
   * How long this attempt has been running, server-measured. Present for
   * every attempt including an untimed one, which is the whole reason it
   * exists: `durationSeconds - remainingSeconds` is the elapsed time of a
   * TIMED attempt only, and training reports both as 0.
   */
  elapsedSeconds?: number;
  /**
   * The seed this attempt's questions were drawn from — six lowercase hex
   * digits. Pass it back to `startSession` to draw the same set again.
   * Absent on an attempt started before seeding existed.
   */
  seed?: string;
  /**
   * Fingerprint of the question pool the draw ran against. A seed only
   * reproduces a draw within one pool: edit the bank and the same seed
   * yields a different set. Carry this beside the seed so a replay can
   * say "the bank changed" instead of looking broken.
   */
  poolDigest?: string;
  /**
   * The curriculum domains this attempt drew from, when the candidate
   * narrowed the draw. Absent or empty means the whole curriculum — a
   * full-coverage attempt, the only kind a "passed" claim can rest on.
   */
  domainFilter?: string[];
  /**
   * An attempt that has been DRAWN but whose clock has not started,
   * because its cluster is still being prepared for the questions it drew.
   *
   * Only a pooled hands-on bank ever produces one: that bank's boot skips
   * the seed loop, so the drawn subset has to be seeded before the
   * candidate can be let in. `state` stays "idle" throughout — deliberately
   * not a fourth state, so a client that has never heard of pooling still
   * reads a truthful snapshot, and DELETE /api/session still cancels.
   *
   * **This field, not `controlStatus.busy`, is the terminal condition.**
   * The seed job settles in the conductor up to a poll before the clock
   * starts; a watcher keyed on the job going idle sees `idle` in that
   * window and flashes the lobby. The server starts the session first and
   * clears this second, so a reader watching this never sees neither.
   */
  preparing?: PreparingAttempt;
  /**
   * Why the last preparation did not produce an attempt. Set with
   * `preparing` absent and `state` still "idle"; absent when the
   * preparation was cancelled rather than failed, which is not an error
   * and must not be shown as one.
   */
  prepareError?: string;
}

/** An attempt between its draw and its clock. See `SessionSnapshot.preparing`. */
export interface PreparingAttempt {
  /** The conductor job doing the seeding; the overlay renders it as-is. */
  jobId: string;
  mode: SessionMode;
  /** How many questions are being seeded, and so how many the attempt has. */
  questionCount: number;
  startedAt: string;
  seed?: string;
  poolDigest?: string;
}

export interface ExamQuestionInfo {
  id: string;
  /** Optional short label from the bank; absent, displays fall back to the id. */
  title?: string;
  /** Which shell host grades this question. Absent on an mcq exam. */
  instance?: string;
  domain: string;
  weight: number;
  totalPoints: number;
  /** How many hint tiers this question has; 0 when it has none. */
  hintCount: number;
  /** mcq only: true for a select-all-that-apply question. */
  multi?: boolean;
  /**
   * How long this question is meant to take, in seconds — the pacing
   * figure the task chip prints.
   *
   * It is a budget, never a limit: nothing enforces it, and running over
   * costs no points. Copy must not imply otherwise.
   */
  targetSeconds?: number;
  /**
   * True when `targetSeconds` was DERIVED (the question's weight's share
   * of the exam clock) rather than authored in the bank. A derived figure
   * must be labelled as derived — it is arithmetic about weights, not
   * anyone's judgement of how long the work takes.
   */
  targetDerived?: boolean;
}

/**
 * One curriculum domain of the loaded exam, as the bank publishes it.
 *
 * `weightPct` is `spec.domainWeights` — what the domain is worth in the
 * real certification — while `questionCount` is how many questions the
 * bank has in it. The two are independent: a domain can be worth 44% of
 * the exam and hold three questions.
 */
export interface DomainInfo {
  name: string;
  weightPct: number;
  questionCount: number;
}

/** Which engine grades the active bank. */
export type ExamType = "hands-on" | "mcq";

/**
 * One selectable attempt mode, described by the server.
 *
 * Every flag is the behaviour the facilitator will actually enforce, so
 * the mode screen's capability list is generated from them rather than
 * restated here. Labels live in `strings.ts`: a mode's name is copy, its
 * permissions are facts only the server knows.
 */
export interface ExamMode {
  id: Exclude<SessionMode, "">;
  durationSeconds: number;
  untimed: boolean;
  /** Hints and reference solutions answer while the attempt runs. */
  helpAllowed: boolean;
  /** Work can be scored mid-attempt without ending it. */
  gradesPerTask: boolean;
  /** A finished attempt in this mode belongs in the attempt history. */
  recorded: boolean;
  /** The one card the mode screen accents. Exactly one mode carries it. */
  recommended: boolean;
}

export interface ExamInfo {
  name: string;
  title: string;
  /**
   * The certification this bank rehearses ("CKAD"), where `title` names
   * the bank ("CKAD Mock Exam 01"). Optional — a bank need not claim
   * one, and every display falls back to the title.
   */
  certification?: string;
  examType: ExamType;
  durationSeconds: number;
  passingScore: number;
  kubernetesVersion: string;
  /**
   * The exam's declared length — for a pooled mcq bank (more authored
   * questions than any one attempt asks), this is the smaller
   * per-attempt count, not the pool size. Before an attempt has drawn
   * its subset, `questions` below still lists the full pool, so this is
   * the field every question-count DISPLAY should read, never
   * `questions.length`.
   */
  questionCount: number;
  questions: ExamQuestionInfo[];
  /** Rendered by the lobby's picker, so the modes are the server's list. */
  modes?: ExamMode[];
  /**
   * The bank's curriculum domains, in the order it declares them — the
   * list the draw configurator's chips are built from.
   *
   * Read this rather than counting `questions` by domain: once an attempt
   * has drawn its subset, `questions` is that subset, so counting it would
   * show the drawn questions as if they were the whole curriculum.
   */
  domains?: DomainInfo[];
  /**
   * The cluster this exam is sat in. Absent for a bank that declares
   * none — every mcq bank, which has no cluster at all — so any copy
   * built from it has to survive not having it.
   *
   * This is the field that lets the product stop asserting CKAD's shape
   * at candidates sitting something else: `nodes` is what the bank asked
   * for and what `bootstrap.sh` actually builds, from the same value.
   */
  environment?: ExamEnvironment;
  /**
   * The bank ships a `tips.md`, so `GET /api/exam/tips` has something to
   * serve. Absent means it does not, and the entry points must not be
   * drawn at all — a control that opens an empty sheet is worse than no
   * control (DESIGN.md: don't draw a control for something the product
   * cannot yet do).
   */
  hasTips?: boolean;
}

/** See `ExamInfo.environment`. */
export interface ExamEnvironment {
  /** How the cluster is built; "kind" is the only one today. */
  provider?: string;
  /** How many nodes it has. */
  nodes?: number;
}

export interface QuestionDetail {
  id: string;
  /** Optional short label from the bank; absent, displays fall back to the id. */
  title?: string;
  /** Absent on an mcq exam. */
  instance?: string;
  domain: string;
  markdown: string;
  /** mcq only: the selectable choices. The answer key is never served here. */
  options?: string[];
  /** mcq only: true for a select-all-that-apply question. */
  multi?: boolean;
}

/**
 * One piece of upstream reading a question points at: the concept it
 * names, and the page that explains it. Authored in the bank
 * (`spec.questions[].docs`) and served only with the solution — the deep
 * dive is read after the attempt, in the candidate's own browser, never
 * on the exam desktop.
 */
export interface SolutionDoc {
  label: string;
  url: string;
}

export interface SolutionDetail {
  id: string;
  markdown: string;
  /** Absent — not empty — on the many questions that declare none. */
  docs?: SolutionDoc[];
}

/**
 * A document a check chose to show alongside its verdict: what it found,
 * what it wanted, or why the difference matters.
 *
 * Checks emit these through a sentinel-delimited trailer on stdout, so a
 * check that emits nothing produces a byte-identical `message` and needs
 * no edit. `kind` is closed at three values for the same reason `Verdict`
 * is: the explanation screen has exactly three places to put one.
 */
export interface CheckArtifact {
  kind: "actual" | "expected" | "why";
  /** For syntax highlighting: "yaml", "text", … Absent means plain text. */
  lang?: string;
  body: string;
}

export interface CheckResult {
  name: string;
  desc: string;
  points: number;
  earned: number;
  passed: boolean;
  message: string;
  /**
   * True when the check never ran because its "# points:" header is
   * malformed in the bank. Rendered as "not graded", never as a failure.
   */
  skipped?: boolean;
  /**
   * Evidence for the explanation screen, dropped from checks that passed
   * — a correct answer has nothing to explain, and keeping the documents
   * would put a copy of the cluster's state in every session file.
   */
  artifacts?: CheckArtifact[];
}

/** The three states a graded question can be in. Server-decided. */
export type Verdict = "correct" | "partial" | "failed";

/** One curriculum domain's slice of a graded attempt, rolled up server-side. */
export interface DomainResult {
  domain: string;
  earned: number;
  total: number;
  /**
   * The domain's share of `Results.percent`, in percentage points — its
   * published curriculum weight, renormalized over the domains this
   * attempt actually covered. Not rounded; format it for display.
   */
  weightPct: number;
  questionCount: number;
}

export interface QuestionResult {
  id: string;
  /** Optional short label from the bank; absent, displays fall back to the id. */
  title?: string;
  instance: string;
  domain: string;
  earned: number;
  total: number;
  checks: CheckResult[];
  /**
   * This question's share of `Results.percent`, in percentage points: its
   * domain's weight split across that domain's questions by points. Every
   * question's share sums to 100.
   *
   * Optional like every field below it: a result graded before these
   * existed is persisted verbatim in the session file and served back
   * unchanged after an upgrade, so a reader cannot assume they are there.
   */
  weightPct?: number;
  /** correct / partial / failed, derived from earned and total by the grader. */
  verdict?: Verdict;
  /**
   * How long this question was on screen, in seconds.
   *
   * It measures the TASK PANE, not attention — a candidate reading the
   * question while thinking in a terminal accrues time, and one who
   * walked away accrues (a capped amount of) it too. Every label built
   * from this must say "open", never "spent" or "worked".
   */
  timeSpentSeconds?: number;
  /** The question's pacing budget, repeated here so the table can compare. */
  targetSeconds?: number;
  /**
   * mcq only (absent on hands-on results): the candidate's selection
   * (absent when unanswered), the answer key, and the option texts —
   * everything the score review needs without re-fetching the question.
   */
  selected?: number[];
  correct?: number[];
  options?: string[];
  multi?: boolean;
  /**
   * The bank's reference solution, on a STORED attempt only.
   *
   * A live result never carries one and must not: the same document is
   * what a mid-session practice grade produces, and the solution
   * endpoint is gated exactly there. Live, the explanation screen asks
   * for it (`GET /api/questions/{id}/solution`) once the attempt has
   * ended.
   *
   * A hosted attempt is read back after the Pod holding the bank is
   * gone, so the facilitator attaches these on the way to the hub — see
   * facilitator/cmd/facilitator/solutions.go. Absent on every attempt
   * stored before that existed, which is why it is optional and why the
   * screen still has something to say when it is missing.
   */
  solution?: string;
  docs?: SolutionDoc[];
}

export interface Results {
  bank: string;
  gradedAt: string;
  earned: number;
  total: number;
  /**
   * The score that decides `passed`: curriculum-weighted, so each domain
   * counts for its published share whatever the drawn questions were
   * worth. `pointsPercent` is the raw earned/total.
   */
  percent: number;
  pointsPercent?: number;
  passingScore: number;
  passed: boolean;
  questions: QuestionResult[];
  /**
   * Per-domain rollup over the questions this attempt was graded on, in
   * bank order. Absent when nothing was graded.
   */
  domains?: DomainResult[];
  /**
   * How the attempt was run, copied onto the result so a score can be
   * read without the session that produced it — which is what history
   * and the results banner both need.
   */
  mode?: SessionMode;
  seed?: string;
  /** The domains the draw was narrowed to; absent means the whole curriculum. */
  domainFilter?: string[];
  /** The attempt's clock and what was used of it. 0 duration means untimed. */
  durationSeconds?: number;
  elapsedSeconds?: number;
}

interface ApiErrorBody {
  error: string;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return body.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

// A facilitator that is reachable but wedged never answers, and fetch has
// no default timeout. Every pending flag in the UI (`starting`, `ending`,
// `switching`, the top progress bar) clears in a `finally`, so before this
// existed a wedged server left buttons disabled and the bar up for the rest
// of the session with no way back short of a reload.
const FETCH_TIMEOUT_MS = 10_000;

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Aborts this call when the caller goes away (useAsync passes its own). */
  signal?: AbortSignal;
  timeoutMs?: number;
}

function withTimeout(ms: number, external?: AbortSignal): AbortSignal {
  // AbortSignal.timeout deliberately, not a hand-rolled setTimeout:
  // ControlProgress's tests run under vi.useFakeTimers(), and a manual
  // timer here would be the one thing in that file able to fire spuriously.
  const timeout = AbortSignal.timeout(ms);
  return external ? AbortSignal.any([external, timeout]) : timeout;
}

async function request(path: string, opts: RequestOptions = {}): Promise<Response> {
  const { signal, timeoutMs = FETCH_TIMEOUT_MS, ...init } = opts;
  try {
    return await fetch(path, { ...init, signal: withTimeout(timeoutMs, signal) });
  } catch (err) {
    // "signal is aborted without reason" tells a candidate nothing. Name
    // the two cases apart: their own navigation, versus a server that went
    // quiet, which is the one they can act on.
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(`no answer in ${Math.round(timeoutMs / 1000)}s`, { cause: err });
    }
    throw err;
  }
}

export async function getSession(signal?: AbortSignal): Promise<SessionSnapshot> {
  const res = await request("/api/session", { signal });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as SessionSnapshot;
}

/**
 * Lifecycle of the exam environment's own start-up.
 *
 * "idle" is not a stage of booting — it is the absence of one. The
 * environment is up and has not been told which exam to be, so no
 * cluster exists and none is coming until a candidate chooses. Nothing
 * should render progress for it.
 */
export type BootState = "booting" | "ready" | "failed" | "idle";

export interface BootStatus {
  state: BootState;
  /** Machine id of the current step, e.g. "seed". */
  phase: string;
  /** Human label for the current step. */
  label: string;
  /** Sub-step progress within the phase, e.g. "question 7 of 22". */
  detail: string;
  /** Populated only when state is "failed". */
  error: string;
  step: number;
  totalSteps: number;
  /** RFC3339; anchors the elapsed counter. */
  startedAt: string;
}

/**
 * The facilitator now starts before the cluster is ready, so this is the
 * one endpoint that answers during a cold boot. It never fails on the
 * server side — "still building" is a normal response — but the fetch
 * itself can still fail in the seconds before the container is listening.
 */
export async function getBoot(signal?: AbortSignal): Promise<BootStatus> {
  const res = await request("/api/boot", { signal });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as BootStatus;
}

export async function getExam(signal?: AbortSignal): Promise<ExamInfo> {
  const res = await request("/api/exam", { signal });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as ExamInfo;
}

/**
 * The loaded bank's exam technique notes.
 *
 * Ungated, unlike solutions and hints: this is how to drive kubectl and
 * an editor quickly, not what any answer is, and it is most useful before
 * the clock starts. Only call it when `ExamInfo.hasTips` is true — the
 * server answers 404 for a bank that ships none.
 */
export async function getExamTips(signal?: AbortSignal): Promise<string> {
  const res = await request("/api/exam/tips", { signal });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return ((await res.json()) as { markdown: string }).markdown;
}

export async function getQuestion(id: string, signal?: AbortSignal): Promise<QuestionDetail> {
  const res = await request(`/api/questions/${encodeURIComponent(id)}`, { signal });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as QuestionDetail;
}

export type SolutionResponse =
  | { ok: true; solution: SolutionDetail }
  | { ok: false; error: string };

// GET /api/questions/{id}/solution is 403 until the session has ended
// (real-exam UX fidelity, not a security boundary) — modeled as a
// tagged union rather than a thrown error so callers render a normal
// "not available yet" state instead of an exception.
export async function getSolution(id: string, signal?: AbortSignal): Promise<SolutionResponse> {
  const res = await request(`/api/questions/${encodeURIComponent(id)}/solution`, { signal });
  if (res.status === 403) {
    return { ok: false, error: await readError(res) };
  }
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return { ok: true, solution: (await res.json()) as SolutionDetail };
}

export type SessionActionResponse =
  | { ok: true; session: SessionSnapshot }
  | { ok: false; error: string };

/** How an attempt is configured at the moment it starts. */
export interface StartOptions {
  mode: Exclude<SessionMode, "">;
  /**
   * Replay a previous draw: six lowercase hex digits. Omitted, the server
   * mints one — every attempt has a seed, so every attempt is replayable
   * without the candidate having to ask for it in advance.
   */
  seed?: string;
  /**
   * Draw only from these curriculum domains. Omitted or empty draws from
   * the whole curriculum.
   */
  domains?: string[];
  /**
   * The pool fingerprint the seed came from, when replaying. The server
   * compares it against the loaded bank's and reports a mismatch back
   * rather than refusing: the draw is still deterministic, it is just no
   * longer the same set, and saying so beats a silent surprise.
   */
  poolDigest?: string;
}

export type StartSessionResponse =
  | { ok: true; session: SessionSnapshot; poolChanged: boolean }
  /**
   * 202: drawn, not started. The cluster is being prepared for the drawn
   * questions and the clock has not begun. The caller does NOT have a
   * session to route on — it hands over to the session poller, which
   * watches `preparing` and routes when it clears.
   */
  | { ok: true; preparing: PreparingAttempt; poolChanged: boolean }
  | { ok: false; error: string };

// POST /api/session/start: 200 with the new session snapshot, 202 with a
// preparation to watch, or 409 (already running/ended, or a preparation
// already in flight) surfaced as {ok:false} for the caller to handle by
// refetching the authoritative session state.
export async function startSession(
  options: StartOptions | Exclude<SessionMode, ""> = "exam",
  signal?: AbortSignal,
): Promise<StartSessionResponse> {
  // The bare-mode form is kept because it is the honest call for every
  // caller that has nothing to configure, and because `./sim` and
  // tests/smoke.sh POST with no body at all — a signature that forced an
  // object would only make those callers write `{ mode: "exam" }`.
  const body: StartOptions = typeof options === "string" ? { mode: options } : options;
  const res = await request("/api/session/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 409) {
    return { ok: false, error: await readError(res) };
  }
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  // Branched on the STATUS, not on the body's shape. 202 also passes
  // `res.ok`, and its body is a preparation rather than a session — read
  // as one it would look like an attempt in state "preparing" with a zero
  // clock, which is exactly the sort of thing that routes a candidate
  // into an exam that has not been set up.
  if (res.status === 202) {
    const body = (await res.json()) as {
      jobId: string;
      mode: SessionMode;
      questionCount: number;
      seed?: string;
      poolDigest?: string;
      poolChanged?: boolean;
    };
    return {
      ok: true,
      preparing: {
        jobId: body.jobId,
        mode: body.mode,
        questionCount: body.questionCount,
        // The 202 does not carry one; the session's own `preparing` does,
        // and that is what every display reads. Stamped here only so the
        // shape is whole.
        startedAt: "",
        seed: body.seed,
        poolDigest: body.poolDigest,
      },
      poolChanged: body.poolChanged === true,
    };
  }
  const session = (await res.json()) as SessionSnapshot & { poolChanged?: boolean };
  return { ok: true, session, poolChanged: session.poolChanged === true };
}

/**
 * PUT /api/session/focus — tell the server which task is on screen.
 *
 * The server owns the clock here exactly as it owns the countdown: the
 * client reports a question id and nothing else, and per-task time is
 * accrued between reports. It rides the existing 10s session poller, so
 * the resolution is coarse by design and a lost report costs at most one
 * interval.
 *
 * A gap contributes at most 90 seconds however long it really was, so a
 * candidate who closes the tab overnight is credited with a minute and a
 * half rather than nine hours. The 409 (the attempt ended under us) is a
 * tagged union rather than a throw for the same reason `putAnswer`'s is:
 * the poller is about to re-route the screen anyway.
 */
export async function putFocus(
  question: string,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await request("/api/session/focus", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal,
  });
  if (res.status === 409 || res.status === 404) {
    return { ok: false, error: await readError(res) };
  }
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return { ok: true };
}

// POST /api/session/end: 202 with the ended session snapshot (submit,
// or a re-grade request on an already-ended session), or 409 if idle.
export async function endSession(signal?: AbortSignal): Promise<SessionActionResponse> {
  const res = await request("/api/session/end", { method: "POST", signal });
  if (res.status === 409) {
    return { ok: false, error: await readError(res) };
  }
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return { ok: true, session: (await res.json()) as SessionSnapshot };
}

export type ResultsResponse =
  | { status: "not-ended" }
  | { status: "grading" }
  | { status: "error"; message: string }
  | { status: "ready"; results: Results };

// GET /api/results: 409 not ended, 202 {"state":"grading"}, 500
// {"error":...} on a persisted gradeError, 200 the results payload.
export async function getResults(signal?: AbortSignal): Promise<ResultsResponse> {
  const res = await request("/api/results", { signal });
  if (res.status === 409) {
    return { status: "not-ended" };
  }
  if (res.status === 202) {
    return { status: "grading" };
  }
  if (res.status === 500) {
    return { status: "error", message: await readError(res) };
  }
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return { status: "ready", results: (await res.json()) as Results };
}

// pollSession is the single poller helper for session state: it fetches
// immediately, then every intervalMs, and again whenever the window
// regains focus (a candidate switching back to the tab after being away
// should see fresh state without waiting out the interval). Returns a
// stop function that cancels both the interval and the focus listener.
export function pollSession(
  onUpdate: (session: SessionSnapshot, fetchedAt: number) => void,
  onError: (err: unknown) => void,
  intervalMs = 10_000,
): () => void {
  let cancelled = false;

  const tick = () => {
    getSession()
      .then((session) => {
        if (!cancelled) {
          onUpdate(session, Date.now());
        }
      })
      .catch((err) => {
        if (!cancelled) {
          onError(err);
        }
      });
  };

  tick();
  const interval = window.setInterval(tick, intervalMs);
  const onFocus = () => tick();
  window.addEventListener("focus", onFocus);

  return () => {
    cancelled = true;
    window.clearInterval(interval);
    window.removeEventListener("focus", onFocus);
  };
}

export type AnswerResponse =
  | { ok: true; id: string; selected: number[] }
  | { ok: false; error: string };

/**
 * PUT /api/questions/{id}/answer — record (or clear, with []) the
 * selection for one mcq question. Called on every option click. The 409
 * — the attempt ended under us, e.g. the timer expired between the
 * click and the request — is a tagged union, not a throw: the session
 * poller will flip the screen momentarily, and the caller just tells
 * the candidate the click didn't count.
 */
export async function putAnswer(
  id: string,
  selected: number[],
  signal?: AbortSignal,
): Promise<AnswerResponse> {
  const res = await request(`/api/questions/${encodeURIComponent(id)}/answer`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selected }),
    signal,
  });
  if (res.status === 409) {
    return { ok: false, error: await readError(res) };
  }
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const body = (await res.json()) as { id: string; selected: number[] };
  return { ok: true, ...body };
}

/**
 * GET /api/answers — every stored selection, keyed by question id. The
 * bulk read McqExam hydrates from on mount, so a reload (or facilitator
 * restart) resumes with each answer intact.
 */
export async function getAnswers(signal?: AbortSignal): Promise<Record<string, number[]>> {
  const res = await request("/api/answers", { signal });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const body = (await res.json()) as { answers: Record<string, number[]> };
  return body.answers ?? {};
}

// ---- control plane (conductor, proxied by the facilitator) ----

export type ControlPhaseState = "pending" | "running" | "done" | "failed";

export interface ControlPhase {
  id: string;
  label: string;
  state: ControlPhaseState;
  /** RFC3339Nano; absent until the phase starts. */
  startedAt?: string;
  /** RFC3339Nano; absent while the phase is still running. */
  finishedAt?: string;
  /** Most recent output line from the phase's command; cleared once it settles. */
  detail?: string;
}

export interface ControlJob {
  id: string;
  /**
   * "seed" prepares the cluster for an attempt that has been drawn but
   * not started — only ever a pooled hands-on bank, whose boot skips the
   * seed loop precisely because the draw decides what to seed. It renders
   * through the same overlay as the other two, which is why it is a job.
   *
   * "provision" is the first exam an environment is ever given: the same
   * sequence as a switch, minus the phases that need an outgoing one. A
   * separate op because nothing about it is a switch — there is no
   * previous bank and nothing is destroyed, and the copy must not say
   * otherwise to somebody choosing their first exam.
   */
  op: "reset" | "switch" | "provision" | "seed";
  bank: string;
  startedAt: string;
  /** RFC3339Nano; absent while the job is in flight. */
  finishedAt?: string;
  phase: string;
  error?: string;
  phases: ControlPhase[];
}

export interface ControlStatus {
  busy: boolean;
  job?: ControlJob;
  lastJob?: ControlJob;
}

export async function getControlStatus(signal?: AbortSignal): Promise<ControlStatus> {
  const res = await request("/api/control/status", { signal });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as ControlStatus;
}

/** The bounded build log of the in-flight control job — or the last one,
 * whose log is exactly the story a failed rebuild needs to tell. */
export interface ControlLog {
  jobId: string;
  lines: string[];
}

export async function getControlLog(signal?: AbortSignal): Promise<ControlLog> {
  const res = await request("/api/control/log", { signal });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const body = (await res.json()) as Partial<ControlLog>;
  // `lines ?? []`, the same guard getAnswers uses: a 200 whose body is
  // missing the array crashed ControlProgress outright (`logLines.length`
  // on undefined) — the type said it could not happen and the cast said
  // so louder. A rebuild's log pane is the wrong place to find out.
  return { jobId: body.jobId ?? "", lines: body.lines ?? [] };
}

export type ControlActionResponse =
  | { ok: true; job: ControlJob }
  | { ok: false; error: string };

export async function startControlReset(signal?: AbortSignal): Promise<ControlActionResponse> {
  const res = await request("/api/control/reset", { method: "POST", signal });
  if (res.status === 202) {
    const body = (await res.json()) as { job: ControlJob };
    return { ok: true, job: body.job };
  }
  return { ok: false, error: await readError(res) };
}

export interface BankEntry {
  id: string;
  title: string;
  certification?: string;
  description?: string;
  examType: string;
  durationSeconds?: number;
  passingScore?: number;
  kubernetesVersion?: string;
  /** How many questions ONE ATTEMPT draws. */
  questionCount?: number;
  /**
   * How many questions the bank authors. Larger than `questionCount`
   * only for a pooled bank; the exam card prints the pair ("65 / 97")
   * only when they differ, because "22 / 22" advertises a pool that is
   * not one.
   */
  poolCount?: number;
  /**
   * How many nodes this exam's cluster has — the bank's
   * `spec.environment.nodes`, and the same number the bootstrap builds
   * from. Absent for a bank that declares none, which is every
   * multiple-choice one: they have no cluster, and copy built from this
   * has to survive not knowing.
   *
   * Served by the hub's catalog. The local `/api/control/banks` and
   * `/api/catalog` do not carry it — the local product asks the loaded
   * exam directly, through `ExamInfo.environment`.
   */
  nodes?: number;
  available: boolean;
  comingSoon?: boolean;
  note?: string;
}

/**
 * The bank list without any attempt history attached.
 *
 * This is the shape of `GET /api/control/banks`, which the UI no longer
 * calls — the exam selector reads `GET /api/catalog` instead, so that
 * every card can carry how that exam has actually gone. The endpoint is
 * still live and still the conductor's own answer (`./sim` and the smoke
 * tests use it); what was removed is the client wrapper, because a
 * plausible-looking `getBanks()` sitting beside `getCatalog()` is an
 * invitation to fetch the list that knows nothing.
 *
 * The type stays because App still asks for one: it keeps a bank id →
 * title map so the rebuild overlay can name the exam a switch is heading
 * to, and `CatalogExam extends BankEntry`, so the catalog narrows to this
 * without a second request.
 */
export interface BanksResponse {
  active: string;
  banks: BankEntry[];
}

export async function startControlSwitch(
  bank: string,
  signal?: AbortSignal,
): Promise<ControlActionResponse> {
  const res = await request("/api/control/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bank }),
    signal,
  });
  if (res.status === 202) {
    const body = (await res.json()) as { job: ControlJob };
    return { ok: true, job: body.job };
  }
  return { ok: false, error: await readError(res) };
}

/** One hint tier. Fetched on demand so revealing a tier is deliberate. */
export interface HintDetail {
  id: string;
  tier: number;
  total: number;
  markdown: string;
}

/**
 * GET /api/questions/{id}/hints/{n}. 403 outside training mode, which is
 * modelled as ok:false rather than thrown — a candidate in an exam
 * hitting this is not an error condition, it is the rules.
 */
export async function getHint(
  id: string,
  tier: number,
  signal?: AbortSignal,
): Promise<{ ok: true; hint: HintDetail } | { ok: false; error: string }> {
  const res = await request(
    `/api/questions/${encodeURIComponent(id)}/hints/${encodeURIComponent(String(tier))}`,
    { signal },
  );
  if (res.status === 403 || res.status === 404) {
    return { ok: false, error: await readError(res) };
  }
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return { ok: true, hint: (await res.json()) as HintDetail };
}

/**
 * POST /api/session/grade — score the work so far without ending the
 * attempt. Training only, and deliberately not persisted: it never
 * appears on /api/results and cannot overwrite a real grade.
 */
export async function practiceGrade(
  signal?: AbortSignal,
): Promise<{ ok: true; results: Results } | { ok: false; error: string }> {
  const res = await request("/api/session/grade", {
    method: "POST",
    signal,
    // A full grade shells into every instance over ssh; the default
    // 10s fetch timeout would abort a run that is working fine.
    timeoutMs: 120_000,
  });
  if (!res.ok) {
    return { ok: false, error: await readError(res) };
  }
  return { ok: true, results: (await res.json()) as Results };
}

/**
 * POST /api/control/reseed — re-run one question's setup.sh, restoring
 * its starting state and discarding the candidate's work on it.
 *
 * Synchronous and slow (up to ~4 minutes for the Helm question), unlike
 * reset/switch which return a job to poll. Training only; the conductor
 * gates on server-side session mode.
 */
export async function reseedQuestion(
  question: string,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await request("/api/control/reseed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal,
    timeoutMs: 300_000,
  });
  if (!res.ok) {
    return { ok: false, error: await readError(res) };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------
// Attempt history and the exam catalog
//
// History is the first thing this product keeps across attempts. It lives
// server-side in a Docker volume, NOT in localStorage — the facilitator is
// the only process that can see every attempt, and a record that vanished
// when the candidate opened a different browser would not be a record.
// Wherever the design brief says "stored in this browser", the copy has to
// say "stored on this machine".
// ---------------------------------------------------------------------

/**
 * One domain's standing, rolled up across attempts rather than within one.
 * `percent` is points earned over points available in that domain — raw,
 * not curriculum-weighted, because this ranks a candidate's own domains
 * against each other and the curriculum's weight is not part of that
 * question.
 */
export interface DomainSummary {
  domain: string;
  earned: number;
  total: number;
  percent: number;
  /**
   * How many graded attempts contributed — every attempt, including the
   * drills `counted` excludes.
   *
   * "Which domains am I weak in" is a different question from "does this
   * count as a sitting": a domain drill is the most informative thing a
   * candidate can do about a weak domain, and a rollup that ignored
   * drills would keep reporting the weakness they spent all week fixing.
   * Show this number beside the percentage — one weak run is not a trend.
   */
  attempts: number;
}

/**
 * A graded attempt, kept forever.
 *
 * Deliberately SELF-CONTAINED: the certification, the exam title, the
 * passing score and the domain rollup are copied in, never referenced.
 * The dashboard shows all five certifications while only one bank is
 * loadable at a time, so a record that pointed at its bank for the
 * details would render as blanks for every exam except the current one.
 */
export interface AttemptRecord {
  id: string;
  bank: string;
  certification?: string;
  examTitle?: string;
  examType: ExamType;
  mode: SessionMode;
  startedAt: string;
  gradedAt: string;
  seed?: string;
  domainFilter?: string[];
  durationSeconds?: number;
  elapsedSeconds?: number;
  questionCount: number;
  earned: number;
  total: number;
  /** The weighted score, the same number the results banner shows. */
  percent: number;
  pointsPercent?: number;
  passingScore: number;
  passed: boolean;
  /**
   * Whether this attempt counts toward `best` and `passed`.
   *
   * False for a domain-filtered or short draw: 100% on a ten-task drill of
   * one domain is a good session, but it is not a CKAD pass, and letting it
   * light up the certification path would make the dashboard lie.
   */
  counted: boolean;
  domains?: DomainResult[];
}

/** One exam's standing, derived from its counted attempts. */
export interface ExamProgress {
  attempts: number;
  counted: number;
  bestPercent?: number;
  passed: boolean;
  lastAttemptAt?: string;
  /** Weakest first. Empty until at least one attempt has been graded. */
  weakDomains: DomainSummary[];
}

/** A catalog row: everything the bank declares, plus how it has gone. */
export interface CatalogExam extends BankEntry {
  progress: ExamProgress;
}

export interface HistorySummary {
  attempts: number;
  /** Distinct certifications with a counted, passing attempt. The path figure. */
  passedCount: number;
  /** How many certifications the path has in it — the denominator. */
  trackCount: number;
  /** Weakest first, across every exam. Backs "drill my weak domains". */
  weakDomains: DomainSummary[];
}

/**
 * GET /api/catalog — the bank list joined to attempt history.
 *
 * Served by the facilitator rather than the conductor, for two reasons:
 * the conductor has no access to the state volume, and LOOKING at the
 * exam list must never be able to trigger a rebuild.
 */
export interface CatalogResponse {
  active: string;
  exams: CatalogExam[];
  summary: HistorySummary;
}

export async function getCatalog(signal?: AbortSignal): Promise<CatalogResponse> {
  const res = await request("/api/catalog", { signal });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as CatalogResponse;
}

export interface HistoryResponse {
  /** Most recent first. */
  attempts: AttemptRecord[];
  summary: HistorySummary;
}

export async function getHistory(signal?: AbortSignal): Promise<HistoryResponse> {
  const res = await request("/api/history", { signal });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as HistoryResponse;
}

/**
 * DELETE /api/history — erase every attempt. There is no undo and no
 * server-side backup, so the caller owns the confirmation.
 */
export async function deleteHistory(
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await request("/api/history", { method: "DELETE", signal });
  if (!res.ok) {
    return { ok: false, error: await readError(res) };
  }
  return { ok: true };
}

/**
 * The export document's URL. A plain link rather than a fetch: the browser
 * saves it under the filename the server names, and no blob is built in
 * memory to do it.
 */
export const historyExportURL = "/api/history/export";

/**
 * POST /api/history/import — merge an exported document into the record.
 *
 * Merge, not replace: importing a backup must never be a way to silently
 * lose the attempts made since it was taken. Records already present (by
 * `id`) are left alone, so importing the same file twice is a no-op.
 */
export async function importHistory(
  document: string,
  signal?: AbortSignal,
): Promise<{ ok: true; imported: number; skipped: number } | { ok: false; error: string }> {
  const res = await request("/api/history/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: document,
    signal,
  });
  if (!res.ok) {
    return { ok: false, error: await readError(res) };
  }
  const body = (await res.json()) as { imported: number; skipped: number };
  return { ok: true, imported: body.imported, skipped: body.skipped };
}

// ---------------------------------------------------------------------
// Hosted mode
//
// Everything below exists only when the SPA is served by the hub rather
// than by a facilitator. `./sim up` never sees any of it: getMe() is the
// one call that probes for a hub, and it answers null against a local
// facilitator, which JSON-404s any /api/* it does not know. That is the
// whole detection mechanism — no build flag, no second bundle, and one
// request on load.

/** Which flavour of session a hosted deployment can hand out. */
export type SessionKind = "practical" | "mcq";

/**
 * Where a hosted session is in its life.
 *
 * `pending` and `starting` are distinct on purpose, and the difference
 * matters to the person waiting: pending means a seat is held and
 * someone else's environment is booting first, starting means their own
 * Pod exists and is building. `failed` keeps the seat so they can read
 * why before it is reaped.
 */
export type HostedSessionState = "pending" | "starting" | "ready" | "failed";

/** One candidate's exam environment, as the hub describes it. */
export interface HostedSession {
  kind: SessionKind;
  bank?: string;
  pod: string;
  state: HostedSessionState;
  startedAt: string;
  /** The hard cap. A session is taken back at this time whatever it is doing. */
  expiresAt: string;
  lastSeen: string;
  error?: string;
}

/** How many of one flavour's seats are taken. */
export interface Seats {
  used: number;
  total: number;
}

/**
 * GET /api/me — identity, seat and queue position in one answer.
 *
 * 200 whether or not anyone is signed in, deliberately: the question the
 * SPA is asking is "am I talking to a hub?", and a 401 would conflate
 * "hosted, logged out" with "not hosted at all".
 */
export interface Me {
  authenticated: boolean;
  authMode: "github" | "header" | "none";
  user?: { id: string; login: string };
  /** Where to send someone who is not signed in. */
  loginURL?: string;
  /** The candidate's own session, absent when they have none. */
  session?: HostedSession;
  /** Their place in the queue, absent unless they are in one. */
  queue?: { position: number };
  /** Per-flavour capacity, keyed by SessionKind. */
  seats?: Partial<Record<SessionKind, Seats>>;
}

/**
 * Probe for a hub. Resolves to null when this is a local facilitator.
 *
 * Two ways to be local, and both are checked. A facilitator answers 404
 * for an /api/* route it does not have; a proxy or a captive portal in
 * front of one might answer 200 with something else entirely, and a body
 * with no `authMode` in it is not a hub however healthy the status line
 * looks. Guessing "hosted" wrongly puts a login screen in front of a
 * local product that has no accounts.
 *
 * Network failures are thrown rather than swallowed: during a cold start
 * the facilitator is not listening yet, and "not answering" is not the
 * same answer as "not hosted".
 */
export async function getMe(signal?: AbortSignal): Promise<Me | null> {
  const res = await request("/api/me", { signal });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const body = (await res.json()) as Partial<Me>;
  if (typeof body.authMode !== "string") return null;
  return body as Me;
}

export type HostedStartResponse =
  /** 202: a seat is held and the environment is being built. Poll /api/me. */
  | { ok: true; starting: true; state: HostedSessionState }
  /** 409: every seat of that flavour is taken. */
  | { ok: true; queued: true; position: number; seats: Seats; error: string }
  | { ok: false; error: string };

/**
 * GET /hub/exams — every exam this deployment offers.
 *
 * The lobby's one call, and the reason it exists is timing: a candidate
 * choosing a certification has no session Pod yet, so the exam selector
 * they know — served by their own facilitator — is not reachable. The
 * hub answers from a bank index staged beside it.
 *
 * `kind` is the seat pool the card competes for, derived by the hub from
 * the bank's own engine rather than here, because the same mapping
 * decides admission.
 *
 * An empty list is a hub with no index staged, and the lobby falls back
 * to offering a flavour — which is what it did before exams were
 * choosable.
 */
export interface HostedExam extends BankEntry {
  kind: SessionKind;
}

export async function getHostedExams(signal?: AbortSignal): Promise<HostedExam[]> {
  const res = await request("/hub/exams", { signal });
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { exams?: HostedExam[] };
  return body.exams ?? [];
}

/**
 * POST /api/session/start naming the exam to sit — hosted admission, not
 * the start of an attempt.
 *
 * The same path does both, in that order: the hub grants a seat and
 * boots a Pod, and only once that Pod answers does it forward the
 * request to the facilitator inside it, which is what actually begins an
 * exam. So this is only ever called when the candidate has no session —
 * once they have one, the ordinary startSession() reaches the
 * facilitator through the same door and configures the attempt properly.
 *
 * `bank` decides the seat: the hub derives the flavour from the exam's
 * engine, so a caller that knows which exam it wants does not have to
 * know — or agree about — which pool that draws from. `kind` alone
 * remains valid and takes the deployment's default exam for that
 * flavour, which is what a hub with no bank index offers.
 *
 * The 200 case is deliberately not modelled: reaching it would mean a
 * ready Pod was handed a body naming an exam and no mode, and starting
 * an unconfigured attempt is precisely what the caller must not do by
 * accident.
 */
export async function startHostedSession(
  kind: SessionKind,
  bank?: string,
  signal?: AbortSignal,
): Promise<HostedStartResponse> {
  const res = await request("/api/session/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bank ? { kind, bank } : { kind }),
    signal,
  });
  if (res.status === 409) {
    const body = (await res.json()) as {
      error: string;
      queued?: boolean;
      position?: number;
      seats?: Seats;
    };
    if (body.queued) {
      return {
        ok: true,
        queued: true,
        position: body.position ?? 0,
        seats: body.seats ?? { used: 0, total: 0 },
        error: body.error,
      };
    }
    return { ok: false, error: body.error };
  }
  if (!res.ok) {
    return { ok: false, error: await readError(res) };
  }
  if (res.status === 202) {
    const body = (await res.json()) as { state: HostedSessionState };
    return { ok: true, starting: true, state: body.state };
  }
  // 200 from a Pod that was already ready. Treated as "you already have
  // one" rather than parsed: the caller's next /api/me poll carries the
  // session, and nothing here should try to interpret a facilitator
  // response to a request the facilitator was never meant to see.
  return { ok: true, starting: true, state: "ready" };
}

/**
 * POST /hub/session/end — give up the seat and the Pod.
 *
 * Deliberately not /api/session/end, which is the facilitator's and ends
 * the ATTEMPT: it grades the exam and writes the record while the
 * environment stays up so the candidate can read their score. Ending the
 * seat is a different act, and a candidate who confused the two would
 * lose their results to a misclick.
 */
export async function endHostedSession(
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await request("/hub/session/end", { method: "POST", signal });
  if (!res.ok) {
    return { ok: false, error: await readError(res) };
  }
  return { ok: true };
}

/** POST /hub/auth/logout — clear the session cookie. */
export async function logout(signal?: AbortSignal): Promise<void> {
  await request("/hub/auth/logout", { method: "POST", signal });
}

/**
 * GET /api/history/{attempt} — the full graded-results document of a
 * past attempt.
 *
 * Hosted only, and it is worth saying why rather than leaving it as an
 * absence. A local facilitator records the attempt SUMMARY in
 * /state/history.json and nothing else; the results document lives in
 * /session, which the next attempt overwrites. The hub keeps both,
 * because its whole reason to exist is that a session Pod is disposable
 * — so "read last Tuesday's exam back" is a thing only hosted mode can
 * offer, not a feature the local product is missing.
 */
export async function getAttemptResults(
  attempt: string,
  signal?: AbortSignal,
): Promise<Results> {
  const res = await request(`/api/history/${encodeURIComponent(attempt)}`, { signal });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as Results;
}
