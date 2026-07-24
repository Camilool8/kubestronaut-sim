// Typed client for the facilitator's HTTP API. Every function fetches a
// relative path (never an absolute origin) so the built bundle works
// identically behind the Vite dev proxy and the production facilitator
// serving the SPA from the same origin as the API — see §3 of the
// milestone design doc for the exact JSON contract mirrored here.

export type SessionState = "idle" | "running" | "ended";

export interface SessionSnapshot {
  state: SessionState;
  bank: string;
  startedAt: string;
  durationSeconds: number;
  remainingSeconds: number;
  endReason: string;
}

export interface ExamQuestionInfo {
  id: string;
  instance: string;
  domain: string;
  weight: number;
  totalPoints: number;
}

export interface ExamInfo {
  name: string;
  title: string;
  durationSeconds: number;
  passingScore: number;
  kubernetesVersion: string;
  questions: ExamQuestionInfo[];
}

export interface QuestionDetail {
  id: string;
  instance: string;
  domain: string;
  markdown: string;
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
}

export interface QuestionResult {
  id: string;
  instance: string;
  domain: string;
  earned: number;
  total: number;
  checks: CheckResult[];
}

export interface Results {
  bank: string;
  gradedAt: string;
  earned: number;
  total: number;
  percent: number;
  passingScore: number;
  passed: boolean;
  questions: QuestionResult[];
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

export async function getSession(): Promise<SessionSnapshot> {
  const res = await fetch("/api/session");
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as SessionSnapshot;
}

export async function getExam(): Promise<ExamInfo> {
  const res = await fetch("/api/exam");
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as ExamInfo;
}

export async function getQuestion(id: string): Promise<QuestionDetail> {
  const res = await fetch(`/api/questions/${encodeURIComponent(id)}`);
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
export async function getSolution(id: string): Promise<SolutionResponse> {
  const res = await fetch(`/api/questions/${encodeURIComponent(id)}/solution`);
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

// POST /api/session/start: 200 with the new session snapshot, or 409
// (already running/ended) surfaced as {ok:false} for the caller to
// handle by refetching the authoritative session state.
export async function startSession(): Promise<SessionActionResponse> {
  const res = await fetch("/api/session/start", { method: "POST" });
  if (res.status === 409) {
    return { ok: false, error: await readError(res) };
  }
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return { ok: true, session: (await res.json()) as SessionSnapshot };
}

// POST /api/session/end: 202 with the ended session snapshot (submit,
// or a re-grade request on an already-ended session), or 409 if idle.
export async function endSession(): Promise<SessionActionResponse> {
  const res = await fetch("/api/session/end", { method: "POST" });
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
export async function getResults(): Promise<ResultsResponse> {
  const res = await fetch("/api/results");
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

// ---- control plane (conductor, proxied by the facilitator) ----

export type ControlPhaseState = "pending" | "running" | "done" | "failed";

export interface ControlPhase {
  id: string;
  label: string;
  state: ControlPhaseState;
}

export interface ControlJob {
  id: string;
  op: "reset" | "switch";
  bank: string;
  startedAt: string;
  phase: string;
  error?: string;
  phases: ControlPhase[];
}

export interface ControlStatus {
  busy: boolean;
  job?: ControlJob;
  lastJob?: ControlJob;
}

export async function getControlStatus(): Promise<ControlStatus> {
  const res = await fetch("/api/control/status");
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as ControlStatus;
}

export type ControlActionResponse =
  | { ok: true; job: ControlJob }
  | { ok: false; error: string };

export async function startControlReset(): Promise<ControlActionResponse> {
  const res = await fetch("/api/control/reset", { method: "POST" });
  if (res.status === 202) {
    const body = (await res.json()) as { job: ControlJob };
    return { ok: true, job: body.job };
  }
  return { ok: false, error: await readError(res) };
}
