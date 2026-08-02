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

export interface SolutionDetail {
  id: string;
  markdown: string;
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

/** Lifecycle of the exam environment's own start-up. */
export type BootState = "booting" | "ready" | "failed";

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
// (killer.sh UX fidelity, not a security boundary) — modeled as a
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
  | { ok: false; error: string };

// POST /api/session/start: 200 with the new session snapshot, or 409
// (already running/ended) surfaced as {ok:false} for the caller to
// handle by refetching the authoritative session state.
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
  op: "reset" | "switch";
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
  available: boolean;
  comingSoon?: boolean;
  note?: string;
}

export interface BanksResponse {
  active: string;
  banks: BankEntry[];
}

export async function getBanks(signal?: AbortSignal): Promise<BanksResponse> {
  const res = await request("/api/control/banks", { signal });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as BanksResponse;
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
