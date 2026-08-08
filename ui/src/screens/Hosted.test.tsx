import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import type { Me } from "../api";
import { NARROW_QUERY } from "../lib/useMediaQuery";
import { TOUCH_ONLY_QUERY } from "../lib/deviceCapability";
import { matchMediaMock } from "../test/setup";
import { strings } from "../strings";

const now = Date.UTC(2026, 7, 4, 12, 0, 0);

function me(overrides: Partial<Me> = {}): Me {
  return {
    authenticated: true,
    authMode: "github",
    user: { id: "583231", login: "octocat" },
    seats: { practical: { used: 1, total: 3 }, mcq: { used: 0, total: 30 } },
    ...overrides,
  };
}

const readySessionStub = {
  state: "idle",
  bank: "ckad-mock-01",
  startedAt: "",
  durationSeconds: 7200,
  remainingSeconds: 0,
  endReason: "",
  mode: "exam",
  untimed: false,
};

const localStubs: Record<string, unknown> = {
  "/api/session": readySessionStub,
  "/api/boot": {
    state: "ready",
    phase: "ready",
    label: "Environment ready",
    detail: "",
    error: "",
    step: 8,
    totalSteps: 8,
    startedAt: "",
  },
  "/api/exam": {
    name: "ckad-mock-01",
    title: "CKAD Mock Exam 01",
    durationSeconds: 7200,
    passingScore: 66,
    questions: [],
  },
  "/api/catalog": {
    active: "ckad-mock-01",
    exams: [
      {
        id: "ckad-mock-01",
        title: "CKAD Mock Exam 01",
        examType: "hands-on",
        available: true,
        progress: { attempts: 0, counted: 0, passed: false, weakDomains: [] },
      },
    ],
    summary: { attempts: 0, passedCount: 0, trackCount: 5, weakDomains: [] },
  },
  "/api/control/status": { busy: false },
};

const attemptRecord = {
  id: "8da8fa50",
  bank: "ckad-mock-01",
  certification: "CKAD",
  examTitle: "CKAD Mock Exam 01",
  examType: "hands-on",
  mode: "exam",
  startedAt: "2026-08-01T09:00:00Z",
  gradedAt: "2026-08-01T11:00:00Z",
  questionCount: 1,
  earned: 8,
  total: 10,
  percent: 80,
  passingScore: 66,
  passed: true,
  counted: true,
  domains: [{ domain: "Observability", earned: 8, total: 10 }],
};

const attemptResults = {
  bank: "ckad-mock-01",
  gradedAt: "2026-08-01T11:00:00Z",
  earned: 8,
  total: 10,
  percent: 80,
  passingScore: 66,
  passed: true,
  mode: "exam",
  questions: [
    {
      id: "q01",
      title: "Expose the deployment",
      domain: "Observability",
      verdict: "correct",
      earned: 8,
      total: 10,
      checks: [],
    },
  ],
  domains: [{ domain: "Observability", earned: 8, total: 10, weightPct: 100, questionCount: 1 }],
};

interface Posted {
  url: string;
  body: string;
}

let posted: Posted[];
let identity: Me | null;

let startAnswer: { status: number; body: unknown };

let hubExams: unknown[];

function stubFetch() {
  posted = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status });

      if (init?.method === "POST") {
        posted.push({ url, body: String(init.body ?? "") });
      }
      if (url.endsWith("/api/me")) {
        return identity === null
          ? json({ error: "not found" }, 404)
          : json(identity);
      }
      if (url.endsWith("/api/session/start") && init?.method === "POST") {
        return json(startAnswer.body, startAnswer.status);
      }
      if (url.endsWith("/hub/exams")) return json({ exams: hubExams });
      if (url.endsWith("/hub/session/end")) return new Response(null, { status: 204 });
      if (url.endsWith("/api/history")) {
        return json({
          attempts: [attemptRecord],
          summary: { attempts: 1, passedCount: 1, trackCount: 5, weakDomains: [] },
        });
      }
      if (url.includes("/api/history/")) return json(attemptResults);

      if (url.endsWith("/api/session")) {
        if (localStubs["/api/session"] === null) {
          return json(
            {
              error: "your exam environment is still starting",
              code: "environment_starting",
              state: "pending",
            },
            503,
          );
        }
        if (localStubs["/api/session"] === "boom") {
          return json({ error: "the facilitator is not answering" }, 500);
        }
      }
      for (const [path, body] of Object.entries(localStubs)) {
        if (url.endsWith(path)) return json(body);
      }
      return json({});
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now });
  identity = me();
  localStubs["/api/session"] = readySessionStub;
  startAnswer = { status: 202, body: { starting: true, state: "pending" } };
  hubExams = [];
  stubFetch();
  window.location.hash = "";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.location.hash = "";

  matchMediaMock([]);
});

test("a facilitator that 404s /api/me gets the local app and no sign-in", async () => {
  identity = null;
  render(<App />);

  expect(await screen.findByRole("heading", { name: /path to kubestronaut/i })).toBeTruthy();
  expect(screen.queryByRole("link", { name: /continue with github/i })).toBeNull();
});

test("a 200 that is not the hub's shape is still read as local", async () => {
  identity = { notAHub: true } as unknown as Me;
  render(<App />);

  expect(await screen.findByRole("heading", { name: /path to kubestronaut/i })).toBeTruthy();
});

test("a signed-out visitor gets the sign-in screen and the seat count", async () => {
  identity = {
    authenticated: false,
    authMode: "github",
    loginURL: "/hub/auth/login",
    seats: { practical: { used: 1, total: 3 } },
  };
  render(<App />);

  const link = await screen.findByRole("link", { name: /continue with github/i });
  expect(link.getAttribute("href")).toBe("/hub/auth/login");

  expect(screen.getByText(/2 of 3 hands-on seats free/i)).toBeTruthy();

  expect(screen.getByText(/No permissions are requested/i)).toBeTruthy();
});

test("the sign-in screen carries the same navbar as every other screen", async () => {
  identity = {
    authenticated: false,
    authMode: "github",
    loginURL: "/hub/auth/login",
    seats: { practical: { used: 1, total: 3 } },
  };
  render(<App />);

  await screen.findByRole("link", { name: /continue with github/i });
  expect(document.querySelector(".signin-mark")).toBeTruthy();
  expect(screen.getByRole("banner")).toBeTruthy();

  expect(screen.getByRole("button", { name: strings.header.menuLabel })).toBeTruthy();

  expect(document.querySelector(".signin-github .signin-github-mark")).toBeTruthy();
});

test("no login URL means no sign-in button", async () => {
  identity = { authenticated: false, authMode: "header" };
  render(<App />);

  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /continue with github/i })).toBeNull();
});

test("the lobby offers certifications and starts the one that is chosen", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  hubExams = [
    {
      id: "ckad-mock-01",
      title: "CKAD Mock Exam 01",
      certification: "CKAD",
      description: "Twenty-two hands-on tasks.",
      examType: "hands-on",
      kind: "practical",
      durationSeconds: 7200,
      questionCount: 22,
      nodes: 2,
      available: true,
    },
    {
      id: "kcna-mock",
      title: "KCNA Mock Exam",
      certification: "KCNA",
      examType: "mcq",
      kind: "mcq",
      durationSeconds: 5400,
      questionCount: 60,
      available: true,
    },
  ];
  render(<App />);

  expect(await screen.findByRole("heading", { name: "CKAD" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "KCNA" })).toBeTruthy();

  expect(screen.getByText("2 of 3 free")).toBeTruthy();
  expect(screen.getByText("30 of 30 free")).toBeTruthy();

  await user.click(screen.getAllByRole("button", { name: "Start" })[1]);

  await waitFor(() => {
    const start = posted.find((p) => p.url.endsWith("/api/session/start"));
    expect(start).toBeTruthy();

    expect(JSON.parse(start!.body)).toEqual({ kind: "mcq", bank: "kcna-mock" });
  });
});

test("a certification with no bank yet is shown without a start button", async () => {
  hubExams = [
    {
      id: "cks-mock",
      title: "CKS Mock Exam",
      certification: "CKS",
      examType: "hands-on",
      kind: "practical",
      available: false,
      comingSoon: true,
      note: "Requires security add-ons the environment has not got yet",
    },
  ];
  render(<App />);

  expect(await screen.findByRole("heading", { name: "CKS" })).toBeTruthy();
  expect(screen.getByText(/security add-ons/i)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
  expect(screen.queryByRole("button", { name: /join the queue/i })).toBeNull();
});

test("signed in with no session, the lobby offers a flavour and posts a kind", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<App />);

  expect(await screen.findByRole("heading", { name: /ready when you are, octocat/i })).toBeTruthy();
  expect(screen.getByRole("heading", { name: /hands-on exam/i })).toBeTruthy();
  expect(screen.getByText("2 of 3 free")).toBeTruthy();
  expect(screen.getByText("30 of 30 free")).toBeTruthy();

  await user.click(screen.getAllByRole("button", { name: "Start" })[0]);

  await waitFor(() => {
    const start = posted.find((p) => p.url.endsWith("/api/session/start"));
    expect(start).toBeTruthy();

    expect(JSON.parse(start!.body)).toEqual({ kind: "practical" });
  });
});

test("a flavour with no seats configured is not offered at all", async () => {
  identity = me({ seats: { practical: { used: 0, total: 3 } } });
  render(<App />);

  expect(await screen.findByRole("heading", { name: /hands-on exam/i })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: /multiple choice/i })).toBeNull();
});

test("a phone is not offered a hands-on seat, and is told why", async () => {
  matchMediaMock([NARROW_QUERY, TOUCH_ONLY_QUERY]);
  render(<App />);

  const practical = await screen.findByRole("heading", { name: /hands-on exam/i });
  const card = practical.closest("article")!;
  expect(within(card).queryByRole("button")).toBeNull();
  expect(within(card).getByText(/needs a keyboard and a desktop browser/i)).toBeTruthy();

  expect(within(card).getByText(strings.mobile.needsDesktop)).toBeTruthy();
  expect(within(card).queryByText(/free$/)).toBeNull();
});

test("a phone can still take a multiple-choice seat", async () => {
  matchMediaMock([NARROW_QUERY, TOUCH_ONLY_QUERY]);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<App />);

  const mcq = await screen.findByRole("heading", { name: /multiple choice/i });
  const card = mcq.closest("article")!;
  await user.click(within(card).getByRole("button", { name: "Start" }));

  await waitFor(() => {
    const start = posted.find((p) => p.url.endsWith("/api/session/start"));
    expect(JSON.parse(start!.body)).toEqual({ kind: "mcq" });
  });
});

test("a wide tablet is refused a hands-on seat too", async () => {
  matchMediaMock([TOUCH_ONLY_QUERY]);
  render(<App />);

  const practical = await screen.findByRole("heading", { name: /hands-on exam/i });
  expect(within(practical.closest("article")!).queryByRole("button")).toBeNull();
});

test("a phone is refused the hands-on certification card as well", async () => {
  matchMediaMock([NARROW_QUERY, TOUCH_ONLY_QUERY]);
  hubExams = [
    {
      id: "ckad-mock-01",
      title: "CKAD Mock Exam 01",
      certification: "CKAD",
      description: "Twenty-two hands-on tasks.",
      examType: "hands-on",
      kind: "practical",
      durationSeconds: 7200,
      questionCount: 22,
      nodes: 2,
      available: true,
    },
    {
      id: "kcna-mock-01",
      title: "KCNA Mock Exam",
      certification: "KCNA",
      description: "Sixty-five multiple-choice questions.",
      examType: "mcq",
      kind: "mcq",
      durationSeconds: 5400,
      questionCount: 65,
      nodes: 0,
      available: true,
    },
  ];
  render(<App />);

  const ckad = await screen.findByRole("heading", { name: "CKAD" });
  expect(within(ckad.closest("article")!).queryByRole("button")).toBeNull();

  const kcna = screen.getByRole("heading", { name: "KCNA" });
  expect(within(kcna.closest("article")!).getByRole("button", { name: "Start" })).toBeTruthy();
});

test("a full flavour offers the queue rather than promising a session", async () => {
  identity = me({
    seats: { practical: { used: 3, total: 3 }, mcq: { used: 0, total: 30 } },
  });
  render(<App />);

  const queue = await screen.findByRole("button", { name: /join the queue/i });
  expect(queue).toBeEnabled();

  expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
});

test("a full pool answers 409 with a place in the queue", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  startAnswer = {
    status: 409,
    body: {
      error: "every practical seat is in use",
      queued: true,
      position: 2,
      seats: { used: 3, total: 3 },
      kind: "practical",
    },
  };
  render(<App />);

  await screen.findByRole("heading", { name: /ready when you are/i });
  await user.click(screen.getAllByRole("button", { name: "Start" })[0]);

  identity = me({ queue: { position: 2 } });

  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toMatch(/number 2 in the queue/i);

  expect(dialog.textContent).toMatch(/held briefly/i);

  await user.click(screen.getByRole("button", { name: /wait here/i }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText(/number 2 in the queue/i)).toBeTruthy();
});

test("pending and starting are different screens", async () => {
  identity = me({
    session: {
      kind: "practical",
      pod: "sim-session-practical-583231",
      state: "pending",
      startedAt: new Date(now - 30_000).toISOString(),
      expiresAt: new Date(now + 36_000_000).toISOString(),
      lastSeen: new Date(now).toISOString(),
    },
  });
  const { unmount } = render(<App />);
  expect(await screen.findByRole("heading", { name: /waiting for a slot/i })).toBeTruthy();
  unmount();

  identity = me({
    session: {
      kind: "practical",
      pod: "sim-session-practical-583231",
      state: "starting",
      startedAt: new Date(now - 30_000).toISOString(),
      expiresAt: new Date(now + 36_000_000).toISOString(),
      lastSeen: new Date(now).toISOString(),
    },
  });
  render(<App />);
  expect(await screen.findByRole("heading", { name: /building your environment/i })).toBeTruthy();
});

test("a failed boot keeps the seat, says why, and offers both ways out", async () => {
  identity = me({
    session: {
      kind: "practical",
      pod: "sim-session-practical-583231",
      state: "failed",
      startedAt: new Date(now - 600_000).toISOString(),
      expiresAt: new Date(now + 36_000_000).toISOString(),
      lastSeen: new Date(now).toISOString(),
      error: "boot timed out after 20m0s",
    },
  });
  render(<App />);

  expect(await screen.findByRole("heading", { name: /did not start/i })).toBeTruthy();
  expect(screen.getByText(/boot timed out after 20m0s/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  expect(screen.getByRole("button", { name: /give up this seat/i })).toBeTruthy();
});

test("a ready session renders the ordinary app with a lease countdown over it", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  identity = me({
    session: {
      kind: "practical",
      pod: "sim-session-practical-583231",
      state: "ready",
      startedAt: new Date(now - 600_000).toISOString(),
      expiresAt: new Date(now + 2 * 3600_000).toISOString(),
      lastSeen: new Date(now).toISOString(),
    },
  });
  render(<App />);

  expect(await screen.findByRole("heading", { name: /path to kubestronaut/i })).toBeTruthy();

  expect(screen.getByText("2:00:00 left")).toBeTruthy();

  await user.click(screen.getByRole("button", { name: strings.header.menuLabel }));
  expect(screen.getByText("octocat")).toBeTruthy();
});

test("a past attempt opens from the dashboard with no environment running", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  window.location.hash = "#/progress";
  render(<App />);

  const row = await screen.findByRole("link", { name: /review the ckad attempt/i });
  await user.click(row);

  expect(await screen.findByText(/expose the deployment/i)).toBeTruthy();

  expect(screen.getByText(/this is a record, not a live session/i)).toBeTruthy();
});

test("the deep dive inside a past attempt links back into the record", async () => {
  window.location.hash = "#/history/8da8fa50";
  render(<App />);

  const open = await screen.findByRole("link", { name: /open/i });
  expect(open.getAttribute("href")).toBe("#/history/8da8fa50/q01");
});

test("the hosted dashboard exports but does not import", async () => {
  window.location.hash = "#/progress";
  render(<App />);

  expect(await screen.findByRole("link", { name: /export/i })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^import$/i })).toBeNull();
});

function readySeat() {
  return {
    kind: "practical" as const,
    bank: "ckad-mock-01",
    pod: "sim-session-practical-583231",
    state: "ready" as const,
    startedAt: new Date(now - 600_000).toISOString(),
    expiresAt: new Date(now + 2 * 3600_000).toISOString(),
    lastSeen: new Date(now).toISOString(),
  };
}

test("a Pod replacement raises no outage toast", async () => {
  identity = me({ session: readySeat() });
  render(<App />);
  await screen.findByRole("heading", { name: /path to kubestronaut/i });

  localStubs["/api/session"] = null;
  window.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(0);

  await waitFor(() => {
    expect(screen.queryByText(/cannot reach facilitator/i)).toBeNull();
  });
});

test("a real failure still raises the toast", async () => {
  identity = me({ session: readySeat() });
  render(<App />);
  await screen.findByRole("heading", { name: /path to kubestronaut/i });

  localStubs["/api/session"] = "boom";
  window.dispatchEvent(new Event("focus"));

  expect(await screen.findByText(/cannot reach facilitator/i)).toBeInTheDocument();
});

test("a rebuild says so, and a first boot still reads as a first boot", async () => {
  hubExams = [
    {
      id: "ckad-mock-01",
      title: "CKAD Mock Exam 01",
      certification: "CKAD",
      examType: "hands-on",
      kind: "practical",
      available: true,
      nodes: 2,
      questionCount: 22,
    },
  ];
  const booting = {
    kind: "practical" as const,
    bank: "ckad-mock-01",
    pod: "sim-session-practical-583231",
    state: "starting" as const,
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 3_600_000).toISOString(),
    lastSeen: new Date(now).toISOString(),
  };

  identity = me({ session: { ...booting, op: "reset" } });
  const rebuild = render(<App />);
  await screen.findByRole("heading", { name: strings.hosted.rebuildTitle });

  await waitFor(() => {
    expect(screen.getByText(/clean CKAD environment/i)).toBeInTheDocument();
  });
  expect(
    screen.getByRole("button", { name: strings.hosted.rebuildGiveUp }),
  ).toBeInTheDocument();

  expect(
    screen.getByText("Tearing down the old cluster and starting a clean one."),
  ).toBeInTheDocument();
  rebuild.unmount();

  identity = me({ session: booting });
  render(<App />);
  await screen.findByRole("heading", { name: strings.hosted.bootStartingTitle });
  expect(
    screen.getByRole("button", { name: strings.hosted.bootGiveUp }),
  ).toBeInTheDocument();
  expect(screen.getByText("Pulling images and starting the cluster.")).toBeInTheDocument();
});

test("a rebuild that fails still reads as a rebuild, not a first boot", async () => {
  const rebuilding = {
    kind: "practical" as const,
    bank: "ckad-mock-01",
    pod: "sim-session-practical-583231",
    state: "starting" as const,
    op: "reset" as const,
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 3_600_000).toISOString(),
    lastSeen: new Date(now).toISOString(),
  };
  identity = me({ session: rebuilding });
  render(<App />);
  await screen.findByRole("heading", { name: strings.hosted.rebuildTitle });

  identity = me({
    session: {
      ...rebuilding,
      state: "failed",
      op: undefined,
      error: "waiting for sim-session-practical-583231 to go away: context deadline exceeded",
    },
  });
  await vi.advanceTimersByTimeAsync(2_000);

  expect(
    await screen.findByRole("heading", { name: strings.hosted.rebuildFailedTitle }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: strings.hosted.rebuildGiveUp }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: strings.hosted.bootFailedTitle })).toBeNull();
});

test("an environment that comes up lands on its exam, not on the picker", async () => {
  identity = me({
    session: {
      kind: "practical",
      bank: "ckad-mock-01",
      pod: "sim-session-practical-583231",
      state: "starting",
      op: "reset",
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 3_600_000).toISOString(),
      lastSeen: new Date(now).toISOString(),
    },
  });
  render(<App />);
  await screen.findByRole("heading", { name: strings.hosted.rebuildTitle });

  identity = me({
    session: {
      kind: "practical",
      bank: "ckad-mock-01",
      pod: "sim-session-practical-583231",
      state: "ready",
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 3_600_000).toISOString(),
      lastSeen: new Date(now).toISOString(),
    },
  });

  await vi.advanceTimersByTimeAsync(2_000);
  await waitFor(() => {
    expect(window.location.hash).toBe("#/exams/ckad-mock-01/mode");
  });
});

test("a page load into a ready seat is left where it is", async () => {
  window.location.hash = "#/progress";
  identity = me({
    session: {
      kind: "practical",
      bank: "ckad-mock-01",
      pod: "sim-session-practical-583231",
      state: "ready",
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 3_600_000).toISOString(),
      lastSeen: new Date(now).toISOString(),
    },
  });
  render(<App />);

  await vi.advanceTimersByTimeAsync(0);
  await waitFor(() => expect(window.location.hash).toBe("#/progress"));
});

test("a rebuild finishing behind a deliberate route does not close it", async () => {
  window.location.hash = "#/progress";
  identity = me({
    session: {
      kind: "practical",
      bank: "ckad-mock-01",
      pod: "sim-session-practical-583231",
      state: "starting",
      op: "reset",
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 3_600_000).toISOString(),
      lastSeen: new Date(now).toISOString(),
    },
  });
  render(<App />);

  await screen.findByRole("link", { name: /export/i });

  identity = me({
    session: {
      kind: "practical",
      bank: "ckad-mock-01",
      pod: "sim-session-practical-583231",
      state: "ready",
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 3_600_000).toISOString(),
      lastSeen: new Date(now).toISOString(),
    },
  });

  await vi.advanceTimersByTimeAsync(2_000);
  await waitFor(() => expect(window.location.hash).toBe("#/progress"));
});

describe("what the boot promises a pooled bank", () => {
  const booting = {
    kind: "practical" as const,
    bank: "ckad-mock-01",
    pod: "sim-session-practical-583231",
    state: "starting" as const,
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 3_600_000).toISOString(),
    lastSeen: new Date(now).toISOString(),
  };

  const bank = (over: Record<string, unknown>) => [
    {
      id: "ckad-mock-01",
      title: "CKAD Mock Exam 01",
      certification: "CKAD",
      examType: "hands-on",
      kind: "practical",
      available: true,
      nodes: 2,
      ...over,
    },
  ];

  // A pooled bank seeds nothing at boot: bootstrap.sh preloads the images and
  // leaves every setup.sh until an attempt draws its tasks. Claiming the setup
  // here is what made the seed at start look like a repeat.
  test("a pooled bank is not promised task setup it defers to the attempt", async () => {
    hubExams = bank({ questionCount: 17, poolCount: 44 });
    identity = me({ session: booting });
    render(<App />);

    await screen.findByRole("heading", { name: strings.hosted.bootStartingTitle });
    expect(screen.queryByText(/worth of setup/i)).not.toBeInTheDocument();
    expect(screen.getByText(/2-node Kubernetes cluster/i)).toBeInTheDocument();
  });

  test("an unpooled bank really does set its tasks up, and still says so", async () => {
    hubExams = bank({ questionCount: 22 });
    identity = me({ session: booting });
    render(<App />);

    await screen.findByRole("heading", { name: strings.hosted.bootStartingTitle });
    expect(screen.getByText(/22 tasks' worth of setup/i)).toBeInTheDocument();
  });

  test("the long wait does not claim questions are being set up", async () => {
    hubExams = bank({ questionCount: 17, poolCount: 44 });
    identity = me({
      session: { ...booting, startedAt: new Date(now - 120_000).toISOString() },
    });
    render(<App />);

    await screen.findByRole("heading", { name: strings.hosted.bootStartingTitle });
    expect(screen.queryByText(/questions are being set up/i)).not.toBeInTheDocument();
  });
});
