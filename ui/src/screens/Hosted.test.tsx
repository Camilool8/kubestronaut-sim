import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import type { Me } from "../api";

// The hosted tier, from the outside: what a browser sees when the SPA is
// served by the hub instead of by a facilitator.
//
// Every test here drives App itself rather than the screens underneath,
// because the thing worth pinning down is the GATE — which product this
// is, and which of five states the candidate is in. A test that mounted
// HostedStart directly would pass whether or not App ever renders it.

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

/** A ready local environment, so the ordinary app can mount over a hub. */
const localStubs: Record<string, unknown> = {
  "/api/session": {
    state: "idle",
    bank: "ckad-mock-01",
    startedAt: "",
    durationSeconds: 7200,
    remainingSeconds: 0,
    endReason: "",
    mode: "exam",
    untimed: false,
  },
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

/** One graded attempt, as the hub keeps it. */
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
/** Status for the next POST /api/session/start, and what it answers with. */
let startAnswer: { status: number; body: unknown };

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
        // A local facilitator JSON-404s any /api/* it does not know, and
        // that 404 IS the detection mechanism.
        return identity === null
          ? json({ error: "not found" }, 404)
          : json(identity);
      }
      if (url.endsWith("/api/session/start") && init?.method === "POST") {
        return json(startAnswer.body, startAnswer.status);
      }
      if (url.endsWith("/hub/session/end")) return new Response(null, { status: 204 });
      if (url.endsWith("/api/history")) {
        return json({
          attempts: [attemptRecord],
          summary: { attempts: 1, passedCount: 1, trackCount: 5, weakDomains: [] },
        });
      }
      if (url.includes("/api/history/")) return json(attemptResults);
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
  startAnswer = { status: 202, body: { starting: true, state: "pending" } };
  stubFetch();
  window.location.hash = "";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

// The property the whole design rests on: `./sim up` is byte-identical,
// and the only trace of hosted mode in it is one 404 at page load.
test("a facilitator that 404s /api/me gets the local app and no sign-in", async () => {
  identity = null;
  render(<App />);

  expect(await screen.findByRole("heading", { name: /path to kubestronaut/i })).toBeTruthy();
  expect(screen.queryByRole("link", { name: /continue with github/i })).toBeNull();
});

// Something in front of a facilitator answering 200 with its own body is
// not a hub, however healthy the status line looks. Guessing "hosted"
// wrongly puts a login screen over a product that has no accounts.
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
  // Capacity before sign-in, on purpose: someone deciding whether to
  // create an account is entitled to know there is somewhere to sit.
  expect(screen.getByText(/2 of 3 hands-on seats free/i)).toBeTruthy();
});

// AUTH_MODE=header behind a proxy that did not identify anyone. There is
// genuinely nothing to sign in to, and a button that 404s is worse.
test("no login URL means no sign-in button", async () => {
  identity = { authenticated: false, authMode: "header" };
  render(<App />);

  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /continue with github/i })).toBeNull();
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
    // A kind, and deliberately no mode: this call is admission, not the
    // start of an attempt. The facilitator inside the Pod configures
    // that later, through the same door.
    expect(JSON.parse(start!.body)).toEqual({ kind: "practical" });
  });
});

// A deployment with no MCQ seats does not offer MCQ. The hub refuses it
// anyway; a disabled card explaining an option that does not exist here
// is a worse way to learn that.
test("a flavour with no seats configured is not offered at all", async () => {
  identity = me({ seats: { practical: { used: 0, total: 3 } } });
  render(<App />);

  expect(await screen.findByRole("heading", { name: /hands-on exam/i })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: /multiple choice/i })).toBeNull();
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
  // What the hub does next: the place is in the identity from now on, so
  // a reload lands back on it.
  identity = me({ queue: { position: 2 } });

  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toMatch(/number 2 in the queue/i);
  // The hold is the mechanism, and it is why the page must stay open.
  expect(dialog.textContent).toMatch(/held briefly/i);

  await user.click(screen.getByRole("button", { name: /wait here/i }));
  // Dismissing the interruption must not lose the state: a place in a
  // queue is standing information, and the page keeps saying so.
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText(/number 2 in the queue/i)).toBeTruthy();
});

// The two waits mean different things to the person waiting, so they say
// different things. Boots are serialised because two at once make both
// slow rather than either fast.
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

  // The exam selector: the same screen a local candidate sees, reaching
  // the same facilitator through the hub's proxy.
  expect(await screen.findByRole("heading", { name: /path to kubestronaut/i })).toBeTruthy();
  expect(screen.getByText("octocat")).toBeTruthy();
  expect(screen.getByText("2:00:00 left")).toBeTruthy();
});

// The whole argument for hosted history: a record you can read without
// spending a seat to do it.
test("a past attempt opens from the dashboard with no environment running", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  window.location.hash = "#/progress";
  render(<App />);

  const row = await screen.findByRole("link", { name: /review the ckad attempt/i });
  await user.click(row);

  expect(await screen.findByText(/expose the deployment/i)).toBeTruthy();
  // Said before anything else, because everything below it is identical
  // to the screen shown at the end of a live exam and is not one.
  expect(screen.getByText(/this is a record, not a live session/i)).toBeTruthy();
});

// Deep-dive links inside a past attempt must stay inside it. The same
// component renders the live results screen, where they point at
// /results — following those from a record would jump into a session
// that may not exist.
test("the deep dive inside a past attempt links back into the record", async () => {
  window.location.hash = "#/history/8da8fa50";
  render(<App />);

  const open = await screen.findByRole("link", { name: /open/i });
  expect(open.getAttribute("href")).toBe("#/history/8da8fa50/q01");
});

// Import is refused by the hub with a 501, and the reason is a property
// of hosted history rather than a missing feature: this is the durable
// copy, and accepting an arbitrary document would let it hold attempts
// that were never graded. Export stays — it still imports into a local
// `./sim`.
test("the hosted dashboard exports but does not import", async () => {
  window.location.hash = "#/progress";
  render(<App />);

  expect(await screen.findByRole("link", { name: /export/i })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^import$/i })).toBeNull();
});
