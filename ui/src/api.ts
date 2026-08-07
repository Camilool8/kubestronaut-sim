import { pointerHeader } from "./lib/deviceCapability";

export type SessionState = "idle" | "running" | "ended";

export type SessionMode = "exam" | "training" | "speed" | "";

export interface SessionSnapshot {
  state: SessionState;
  bank: string;
  startedAt: string;
  durationSeconds: number;
  remainingSeconds: number;
  endReason: string;
  mode: SessionMode;

  untimed: boolean;

  elapsedSeconds?: number;

  seed?: string;

  poolDigest?: string;

  domainFilter?: string[];

  preparing?: PreparingAttempt;

  prepareError?: string;
}

export interface PreparingAttempt {
  jobId: string;
  mode: SessionMode;

  questionCount: number;
  startedAt: string;
  seed?: string;
  poolDigest?: string;
}

export interface ExamQuestionInfo {
  id: string;

  title?: string;

  instance?: string;
  domain: string;
  weight: number;
  totalPoints: number;

  hintCount: number;

  multi?: boolean;

  targetSeconds?: number;

  targetDerived?: boolean;
}

export interface DomainInfo {
  name: string;
  weightPct: number;
  questionCount: number;
}

export type ExamType = "hands-on" | "mcq";

export interface ExamMode {
  id: Exclude<SessionMode, "">;
  durationSeconds: number;
  untimed: boolean;

  helpAllowed: boolean;

  gradesPerTask: boolean;

  recorded: boolean;

  recommended: boolean;
}

export interface ExamInfo {
  name: string;
  title: string;

  certification?: string;
  examType: ExamType;
  durationSeconds: number;
  passingScore: number;
  kubernetesVersion: string;

  questionCount: number;
  questions: ExamQuestionInfo[];

  modes?: ExamMode[];

  domains?: DomainInfo[];

  environment?: ExamEnvironment;

  hasTips?: boolean;
}

export interface ExamEnvironment {
  provider?: string;

  nodes?: number;
}

export interface QuestionDetail {
  id: string;

  title?: string;

  instance?: string;
  domain: string;
  markdown: string;

  options?: string[];

  multi?: boolean;
}

export interface SolutionDoc {
  label: string;
  url: string;
}

export interface SolutionDetail {
  id: string;
  markdown: string;

  docs?: SolutionDoc[];
}

export interface CheckArtifact {
  kind: "actual" | "expected" | "why";

  lang?: string;
  body: string;
}

// One graded thing inside a check. Weights are relative to each other, not to
// the check's points — the grader scales them.
export interface Criterion {
  desc: string;
  weight: number;
  passed: boolean;
}

export interface CheckResult {
  name: string;
  desc: string;
  points: number;
  earned: number;
  passed: boolean;
  message: string;

  skipped?: boolean;

  criteria?: Criterion[];

  artifacts?: CheckArtifact[];
}

export type Verdict = "correct" | "partial" | "failed";

export interface DomainResult {
  domain: string;
  earned: number;
  total: number;

  weightPct: number;
  questionCount: number;
}

export interface QuestionResult {
  id: string;

  title?: string;
  instance: string;
  domain: string;
  earned: number;
  total: number;
  checks: CheckResult[];

  weightPct?: number;

  verdict?: Verdict;

  timeSpentSeconds?: number;

  targetSeconds?: number;

  selected?: number[];
  correct?: number[];
  options?: string[];
  multi?: boolean;

  solution?: string;
  docs?: SolutionDoc[];
}

export interface Results {
  bank: string;
  gradedAt: string;
  earned: number;
  total: number;

  percent: number;
  pointsPercent?: number;
  passingScore: number;
  passed: boolean;
  questions: QuestionResult[];

  domains?: DomainResult[];

  mode?: SessionMode;
  seed?: string;

  domainFilter?: string[];

  durationSeconds?: number;
  elapsedSeconds?: number;
}

interface ApiErrorBody {
  error: string;
  code?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const ENVIRONMENT_STARTING = "environment_starting";

export function isEnvironmentStarting(err: unknown): boolean {
  return err instanceof ApiError && err.code === ENVIRONMENT_STARTING;
}

async function apiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return new ApiError(res.status, body.error || `HTTP ${res.status}`, body.code);
  } catch {
    return new ApiError(res.status, `HTTP ${res.status}`);
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return body.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

const FETCH_TIMEOUT_MS = 10_000;

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;

  signal?: AbortSignal;
  timeoutMs?: number;
}

function withTimeout(ms: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return external ? AbortSignal.any([external, timeout]) : timeout;
}

async function request(path: string, opts: RequestOptions = {}): Promise<Response> {
  const { signal, timeoutMs = FETCH_TIMEOUT_MS, headers, ...init } = opts;
  try {
    return await fetch(path, {
      ...init,

      headers: { ...pointerHeader(), ...headers },
      signal: withTimeout(timeoutMs, signal),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(`no answer in ${Math.round(timeoutMs / 1000)}s`, { cause: err });
    }
    throw err;
  }
}

export async function getSession(signal?: AbortSignal): Promise<SessionSnapshot> {
  const res = await request("/api/session", { signal });
  if (!res.ok) {
    throw await apiError(res);
  }
  return (await res.json()) as SessionSnapshot;
}

export type BootState = "booting" | "ready" | "failed" | "idle";

export interface BootStatus {
  state: BootState;

  phase: string;

  label: string;

  detail: string;

  error: string;
  step: number;
  totalSteps: number;

  startedAt: string;
}

export async function getBoot(signal?: AbortSignal): Promise<BootStatus> {
  const res = await request("/api/boot", { signal });
  if (!res.ok) {
    throw await apiError(res);
  }
  return (await res.json()) as BootStatus;
}

export async function getExam(signal?: AbortSignal): Promise<ExamInfo> {
  const res = await request("/api/exam", { signal });
  if (!res.ok) {
    throw await apiError(res);
  }
  return (await res.json()) as ExamInfo;
}

export async function getExamTips(signal?: AbortSignal): Promise<string> {
  const res = await request("/api/exam/tips", { signal });
  if (!res.ok) {
    throw await apiError(res);
  }
  return ((await res.json()) as { markdown: string }).markdown;
}

export async function getQuestion(id: string, signal?: AbortSignal): Promise<QuestionDetail> {
  const res = await request(`/api/questions/${encodeURIComponent(id)}`, { signal });
  if (!res.ok) {
    throw await apiError(res);
  }
  return (await res.json()) as QuestionDetail;
}

export type SolutionResponse =
  | { ok: true; solution: SolutionDetail }
  | { ok: false; error: string };

export async function getSolution(id: string, signal?: AbortSignal): Promise<SolutionResponse> {
  const res = await request(`/api/questions/${encodeURIComponent(id)}/solution`, { signal });
  if (res.status === 403) {
    return { ok: false, error: await readError(res) };
  }
  if (!res.ok) {
    throw await apiError(res);
  }
  return { ok: true, solution: (await res.json()) as SolutionDetail };
}

export type SessionActionResponse =
  | { ok: true; session: SessionSnapshot }
  | { ok: false; error: string };

export interface StartOptions {
  mode: Exclude<SessionMode, "">;

  seed?: string;

  domains?: string[];

  poolDigest?: string;
}

export type StartSessionResponse =
  | { ok: true; session: SessionSnapshot; poolChanged: boolean }

  | { ok: true; preparing: PreparingAttempt; poolChanged: boolean }
  | { ok: false; error: string };

export async function startSession(
  options: StartOptions | Exclude<SessionMode, ""> = "exam",
  signal?: AbortSignal,
): Promise<StartSessionResponse> {
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
    throw await apiError(res);
  }

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
    throw await apiError(res);
  }
  return { ok: true };
}

export async function endSession(signal?: AbortSignal): Promise<SessionActionResponse> {
  const res = await request("/api/session/end", { method: "POST", signal });
  if (res.status === 409) {
    return { ok: false, error: await readError(res) };
  }
  if (!res.ok) {
    throw await apiError(res);
  }
  return { ok: true, session: (await res.json()) as SessionSnapshot };
}

export type ResultsResponse =
  | { status: "not-ended" }
  | { status: "grading" }
  | { status: "error"; message: string }
  | { status: "ready"; results: Results };

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
    throw await apiError(res);
  }
  return { status: "ready", results: (await res.json()) as Results };
}

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
    throw await apiError(res);
  }
  const body = (await res.json()) as { id: string; selected: number[] };
  return { ok: true, ...body };
}

export async function getAnswers(signal?: AbortSignal): Promise<Record<string, number[]>> {
  const res = await request("/api/answers", { signal });
  if (!res.ok) {
    throw await apiError(res);
  }
  const body = (await res.json()) as { answers: Record<string, number[]> };
  return body.answers ?? {};
}

export type ControlPhaseState = "pending" | "running" | "done" | "failed";

export interface ControlPhase {
  id: string;
  label: string;
  state: ControlPhaseState;

  startedAt?: string;

  finishedAt?: string;

  detail?: string;
}

export interface ControlJob {
  id: string;

  op: "reset" | "switch" | "provision" | "seed";
  bank: string;
  startedAt: string;

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
    throw await apiError(res);
  }
  return (await res.json()) as ControlStatus;
}

export interface ControlLog {
  jobId: string;
  lines: string[];
}

export async function getControlLog(signal?: AbortSignal): Promise<ControlLog> {
  const res = await request("/api/control/log", { signal });
  if (!res.ok) {
    throw await apiError(res);
  }
  const body = (await res.json()) as Partial<ControlLog>;

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

  questionCount?: number;

  poolCount?: number;

  nodes?: number;
  available: boolean;
  comingSoon?: boolean;
  note?: string;
}

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

export interface HintDetail {
  id: string;
  tier: number;
  total: number;
  markdown: string;
}

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
    throw await apiError(res);
  }
  return { ok: true, hint: (await res.json()) as HintDetail };
}

export async function practiceGrade(
  signal?: AbortSignal,
): Promise<{ ok: true; results: Results } | { ok: false; error: string }> {
  const res = await request("/api/session/grade", {
    method: "POST",
    signal,

    timeoutMs: 120_000,
  });
  if (!res.ok) {
    return { ok: false, error: await readError(res) };
  }
  return { ok: true, results: (await res.json()) as Results };
}

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

export interface DomainSummary {
  domain: string;
  earned: number;
  total: number;
  percent: number;

  attempts: number;
}

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

  percent: number;
  pointsPercent?: number;
  passingScore: number;
  passed: boolean;

  counted: boolean;
  domains?: DomainResult[];
}

export interface ExamProgress {
  attempts: number;
  counted: number;
  bestPercent?: number;
  passed: boolean;
  lastAttemptAt?: string;

  weakDomains: DomainSummary[];
}

export interface CatalogExam extends BankEntry {
  progress: ExamProgress;
}

export interface HistorySummary {
  attempts: number;

  passedCount: number;

  trackCount: number;

  weakDomains: DomainSummary[];
}

export interface CatalogResponse {
  active: string;
  exams: CatalogExam[];
  summary: HistorySummary;
}

export async function getCatalog(signal?: AbortSignal): Promise<CatalogResponse> {
  const res = await request("/api/catalog", { signal });
  if (!res.ok) {
    throw await apiError(res);
  }
  return (await res.json()) as CatalogResponse;
}

export interface HistoryResponse {
  attempts: AttemptRecord[];
  summary: HistorySummary;
}

export async function getHistory(signal?: AbortSignal): Promise<HistoryResponse> {
  const res = await request("/api/history", { signal });
  if (!res.ok) {
    throw await apiError(res);
  }
  return (await res.json()) as HistoryResponse;
}

export async function deleteHistory(
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await request("/api/history", { method: "DELETE", signal });
  if (!res.ok) {
    return { ok: false, error: await readError(res) };
  }
  return { ok: true };
}

export const historyExportURL = "/api/history/export";

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

export type SessionKind = "practical" | "mcq";

export type HostedSessionState = "pending" | "starting" | "ready" | "failed";

export interface HostedSession {
  kind: SessionKind;
  bank?: string;
  pod: string;
  state: HostedSessionState;
  startedAt: string;

  expiresAt: string;
  lastSeen: string;
  error?: string;

  op?: "reset" | "switch";
}

export interface Seats {
  used: number;
  total: number;
}

export interface Me {
  authenticated: boolean;
  authMode: "github" | "header" | "none";
  user?: { id: string; login: string };

  loginURL?: string;

  session?: HostedSession;

  queue?: { position: number };

  seats?: Partial<Record<SessionKind, Seats>>;
}

export async function getMe(signal?: AbortSignal): Promise<Me | null> {
  const res = await request("/api/me", { signal });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw await apiError(res);
  }
  const body = (await res.json()) as Partial<Me>;
  if (typeof body.authMode !== "string") return null;
  return body as Me;
}

export type HostedStartResponse =

  | { ok: true; starting: true; state: HostedSessionState }

  | { ok: true; queued: true; position: number; seats: Seats; error: string }
  | { ok: false; error: string };

export interface HostedExam extends BankEntry {
  kind: SessionKind;
}

export async function getHostedExams(signal?: AbortSignal): Promise<HostedExam[]> {
  const res = await request("/hub/exams", { signal });
  if (!res.ok) throw await apiError(res);
  const body = (await res.json()) as { exams?: HostedExam[] };
  return body.exams ?? [];
}

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

  return { ok: true, starting: true, state: "ready" };
}

export async function endHostedSession(
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await request("/hub/session/end", { method: "POST", signal });
  if (!res.ok) {
    return { ok: false, error: await readError(res) };
  }
  return { ok: true };
}

export async function logout(signal?: AbortSignal): Promise<void> {
  await request("/hub/auth/logout", { method: "POST", signal });
}

export async function getAttemptResults(
  attempt: string,
  signal?: AbortSignal,
): Promise<Results> {
  const res = await request(`/api/history/${encodeURIComponent(attempt)}`, { signal });
  if (!res.ok) {
    throw await apiError(res);
  }
  return (await res.json()) as Results;
}
