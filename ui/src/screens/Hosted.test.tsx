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

/** A settled idle session, as the facilitator reports one. */
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

/** A ready local environment, so the ordinary app can mount over a hub. */
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
/**
 * What GET /hub/exams answers.
 *
 * Empty by default, which is a real deployment state — a hub with no
 * bank index staged — and the one the flavour-card tests below cover.
 * The tests that set it are the ordinary case: candidates choose the
 * certification.
 */
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
        // A local facilitator JSON-404s any /api/* it does not know, and
        // that 404 IS the detection mechanism.
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
      // Two failure fixtures for the session poll, opted into by writing
      // a sentinel into localStubs. `null` is the hub's answer while it
      // replaces a Pod — an expected wait. "boom" is a facilitator that
      // has actually fallen over, which must still be reported.
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
  // What pressing it actually costs, said first. The hub requests no
  // OAuth scopes at all, and "Continue with GitHub" is a phrase people
  // have learned to read as "grant this app my repositories".
  expect(screen.getByText(/No permissions are requested/i)).toBeTruthy();
});

// It is the only screen in the product with no header, so it is the only
// one that has to carry the header's furniture itself — otherwise a
// visitor's first impression is a heading alone in the top-left corner of
// an empty page, with no mark, no wordmark and no way to set the theme.
test("the sign-in screen carries the product's own chrome", async () => {
  identity = {
    authenticated: false,
    authMode: "github",
    loginURL: "/hub/auth/login",
    seats: { practical: { used: 1, total: 3 } },
  };
  render(<App />);

  await screen.findByRole("link", { name: /continue with github/i });
  expect(document.querySelector(".signin-mark")).toBeTruthy();
  expect(screen.getByText("kubestronaut")).toBeTruthy();
  expect(screen.getByRole("button", { name: /theme/i })).toBeTruthy();
  // The GitHub mark rides the button it belongs to.
  expect(document.querySelector(".signin-github .signin-github-mark")).toBeTruthy();
});

// AUTH_MODE=header behind a proxy that did not identify anyone. There is
// genuinely nothing to sign in to, and a button that 404s is worse.
test("no login URL means no sign-in button", async () => {
  identity = { authenticated: false, authMode: "header" };
  render(<App />);

  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /continue with github/i })).toBeNull();
});

// The ordinary lobby: the candidate picks the certification they came
// for. It used to offer "hands-on" or "multiple choice" and the exam
// behind each was a chart value they never saw, which worked only while
// there was exactly one of each.
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
  // Seats stay per ENGINE: what a seat costs is a Pod, and every
  // hands-on exam is one, so CKAD and CKA draw from the same pool.
  expect(screen.getByText("2 of 3 free")).toBeTruthy();
  expect(screen.getByText("30 of 30 free")).toBeTruthy();

  await user.click(screen.getAllByRole("button", { name: "Start" })[1]);

  await waitFor(() => {
    const start = posted.find((p) => p.url.endsWith("/api/session/start"));
    expect(start).toBeTruthy();
    // The exam decides the seat. The kind rides along, but the hub
    // derives the flavour from the bank's own engine.
    expect(JSON.parse(start!.body)).toEqual({ kind: "mcq", bank: "kcna-mock" });
  });
});

// A certification on the path whose bank is not written is listed —
// seeing that CKS is coming is worth something — but there is nothing to
// press, and the card says why rather than failing on the click.
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

// The button stays enabled when every seat is taken — the queue is the
// answer to a full pool, and a greyed-out button offers no way to ask
// for one — so it has to say what the click will actually produce.
test("a full flavour offers the queue rather than promising a session", async () => {
  identity = me({
    seats: { practical: { used: 3, total: 3 }, mcq: { used: 0, total: 30 } },
  });
  render(<App />);

  const queue = await screen.findByRole("button", { name: /join the queue/i });
  expect(queue).toBeEnabled();
  // The flavour that is not full still says Start.
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

/** A ready hosted seat, so SimApp mounts and its session poller runs. */
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

// The reported bug, in the window it actually happens in.
//
// SimApp has to be MOUNTED and its session poller running, because that
// poller is what raises the toast. /api/me flips to "pending" about two
// seconds after the POST and unmounts SimApp — but a toast pushed before
// then lives in a module singleton and outlives it. So the fixture holds
// /api/me at "ready" while the proxy has already started answering 503,
// which is exactly the race.
test("a Pod replacement raises no outage toast", async () => {
  identity = me({ session: readySeat() });
  render(<App />);
  await screen.findByRole("heading", { name: /path to kubestronaut/i });

  // The hub begins replacing the Pod. Every proxied request is a 503 from
  // here on; /api/me has not caught up.
  localStubs["/api/session"] = null;
  window.dispatchEvent(new Event("focus")); // pollSession re-fetches on focus
  await vi.advanceTimersByTimeAsync(0); // let the mocked 503 round-trip settle

  await waitFor(() => {
    expect(screen.queryByText(/cannot reach facilitator/i)).toBeNull();
  });
});

// The other half, and the reason the guard is a code and not a blanket
// mute: a facilitator that has genuinely fallen over must still say so.
test("a real failure still raises the toast", async () => {
  identity = me({ session: readySeat() });
  render(<App />);
  await screen.findByRole("heading", { name: /path to kubestronaut/i });

  localStubs["/api/session"] = "boom"; // forces the 500 branch in stubFetch
  window.dispatchEvent(new Event("focus"));

  expect(await screen.findByText(/cannot reach facilitator/i)).toBeInTheDocument();
});
