import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import type { ControlJob, ControlStatus, SessionSnapshot } from "./api";
import { toastStore } from "./components/toastStore";

const idleSession: SessionSnapshot = {
  state: "idle",
  bank: "ckad-mock-01",
  startedAt: "",
  durationSeconds: 7200,
  remainingSeconds: 0,
  endReason: "",
  mode: "exam",
  untimed: false,
};

// Every test below is about a *built* environment, so they all report a
// ready boot. Without it the boot gate covers the screen under test —
// which is itself the behaviour TestBootGate* below pins down.
const readyBoot = {
  state: "ready",
  phase: "ready",
  label: "Environment ready",
  detail: "",
  error: "",
  step: 8,
  totalSteps: 8,
  startedAt: "",
};

const exam = {
  name: "ckad-mock-01",
  title: "CKAD Mock Exam 01",
  durationSeconds: 7200,
  passingScore: 66,
  kubernetesVersion: "1.35",
  questions: [],
};

const banks = {
  active: "ckad-mock-01",
  banks: [
    { id: "ckad-mock-01", title: "CKAD Mock Exam 01", examType: "hands-on", available: true },
    { id: "cka-mock-01", title: "CKA Mock Exam 01", examType: "hands-on", available: true },
  ],
};

// The job POST /api/control/switch returns: freshly begun, so every
// phase is still pending and `phase` is empty.
const freshJob: ControlJob = {
  id: "job-1",
  op: "switch",
  bank: "cka-mock-01",
  startedAt: "2026-07-25T12:00:00Z",
  phase: "",
  phases: [
    { id: "end-session", label: "End session and lock desktop", state: "pending" },
    { id: "recreate-cluster", label: "Recreate Kubernetes cluster", state: "pending" },
  ],
};

// What the conductor actually reports a moment later: the fast phases
// are already done and the long one is running.
const runningStatus: ControlStatus = {
  busy: true,
  job: {
    ...freshJob,
    phase: "recreate-cluster",
    phases: [
      {
        id: "end-session",
        label: "End session and lock desktop",
        state: "done",
        startedAt: "2026-07-25T12:00:00Z",
        finishedAt: "2026-07-25T12:00:02Z",
      },
      {
        id: "recreate-cluster",
        label: "Recreate Kubernetes cluster",
        state: "running",
        startedAt: "2026-07-25T12:00:02Z",
      },
    ],
  },
};

let controlStatus: ControlStatus;
let statusPolls: number;

function stubFetch() {
  statusPolls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status });

      if (url.endsWith("/api/control/switch") && init?.method === "POST") {
        return json({ job: freshJob }, 202);
      }
      if (url.endsWith("/api/control/status")) {
        statusPolls++;
        return json(controlStatus);
      }
      if (url.endsWith("/api/boot")) return json(readyBoot);
      if (url.endsWith("/api/session")) return json(idleSession);
      if (url.endsWith("/api/exam")) return json(exam);
      if (url.endsWith("/api/control/banks")) return json(banks);
      return json({});
    }),
  );
}

beforeEach(() => {
  controlStatus = { busy: false };
  stubFetch();
  // Warning toasts (control-action failures) never auto-dismiss, and
  // toastStore is a module singleton — without this, a toast pushed by
  // one test would still be in the DOM when the next test's App mounts,
  // letting a findByText(/control plane/i) assertion pass without the
  // click under test actually producing it.
  toastStore.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("App control polling", () => {
  // The reported bug: the idle poll timer is armed at 15s, and starting
  // a job never rescheduled it. The optimistic snapshot the POST returns
  // has every phase pending, so the checklist sat visibly frozen for up
  // to fifteen seconds before the first real status arrived.
  test("re-polls immediately when a job starts instead of waiting out the idle timer", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("CKAD Mock Exam 01", { selector: "h1" });

    // Let the mount-time poll settle so the idle 15s timer is the one armed.
    await waitFor(() => expect(statusPolls).toBeGreaterThan(0));
    const pollsBeforeSwitch = statusPolls;
    controlStatus = runningStatus;

    await user.click(screen.getByRole("button", { name: /CKA Mock Exam 01/ }));
    await user.click(screen.getByRole("button", { name: "Switch exam" }));

    // The user-visible symptom: the checklist must reach the real state
    // promptly. Without a forced re-poll the optimistic all-pending
    // snapshot stays on screen for CONTROL_POLL_IDLE_MS (15s).
    await waitFor(
      () => {
        const row = screen.getByText("Recreate Kubernetes cluster").closest("li");
        expect(row).toHaveClass("phase-running");
      },
      { timeout: 3_000 },
    );
    expect(statusPolls).toBeGreaterThan(pollsBeforeSwitch);
  });
});

const endedSession: SessionSnapshot = {
  state: "ended",
  bank: "ckad-mock-01",
  startedAt: "2026-07-25T12:00:00Z",
  durationSeconds: 7200,
  remainingSeconds: 0,
  endReason: "submitted",
  mode: "exam",
  untimed: false,
};

// GET /api/results returns the flat Results payload on 200 — getControl
// status already wraps it as {status:"ready", results} in api.ts, so the
// mock must not double-wrap it (that made Score crash on
// results.questions.map before the button under test ever rendered).
const results = {
  percent: 0,
  passed: false,
  earned: 0,
  total: 17,
  passingScore: 66,
  questions: [],
};

describe("App control failures", () => {
  // The reported bug: with the conductor container down the facilitator's
  // proxy returns 502, startControlReset resolves {ok:false}, and the
  // ok:false branch rendered nothing at all — no toast, no overlay. The
  // button looked dead while the server was working correctly.
  test("tells the user when a control action is refused instead of doing nothing", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const json = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), { status });

        if (url.endsWith("/api/control/reset") && init?.method === "POST") {
          // Exactly what the proxy returns when the conductor is down:
          // 502 with an empty body.
          return new Response("", { status: 502 });
        }
        if (url.endsWith("/api/control/status")) return json({ busy: false });
        if (url.endsWith("/api/boot")) return json(readyBoot);
        if (url.endsWith("/api/session")) return json(endedSession);
        if (url.endsWith("/api/results")) return json(results);
        if (url.endsWith("/api/exam")) return json(exam);
        if (url.endsWith("/api/control/banks")) return json(banks);
        return json({});
      }),
    );

    render(<App />);
    const button = await screen.findByRole("button", { name: "New attempt" });
    await user.click(button);

    const alert = await screen.findByText(/control plane/i);
    expect(alert).toBeInTheDocument();
  });

  // The other half of the same bug: not a 502 response but the fetch
  // itself rejecting (facilitator unreachable, DNS/network down). Before
  // runControlAction's try/catch this was an unhandled promise rejection
  // — handleNewAttempt awaited startControlReset() with nothing to catch
  // the throw, so the click again did nothing the user could see.
  test("tells the user when the control request itself fails, not just when it resolves ok:false", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const json = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), { status });

        if (url.endsWith("/api/control/reset") && init?.method === "POST") {
          // fetch() itself throws — no response at all, e.g. the
          // facilitator's host is unreachable.
          throw new TypeError("Failed to fetch");
        }
        if (url.endsWith("/api/control/status")) return json({ busy: false });
        if (url.endsWith("/api/boot")) return json(readyBoot);
        if (url.endsWith("/api/session")) return json(endedSession);
        if (url.endsWith("/api/results")) return json(results);
        if (url.endsWith("/api/exam")) return json(exam);
        if (url.endsWith("/api/control/banks")) return json(banks);
        return json({});
      }),
    );

    render(<App />);
    const button = await screen.findByRole("button", { name: "New attempt" });
    await user.click(button);

    const alert = await screen.findByText(/control plane/i);
    expect(alert).toBeInTheDocument();
  });

  // The third control-action entry point. `handleNewAttempt` (above) and
  // the overlay's Retry (below) both go through App's runControlAction;
  // the lobby's bank switch called startControlSwitch directly with no
  // catch, so a rejected fetch was an unhandled rejection: the confirm
  // dialog just sat there, spinner off, saying nothing.
  test("tells the user when the bank switch request itself fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const json = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), { status });

        if (url.endsWith("/api/control/switch") && init?.method === "POST") {
          throw new TypeError("Failed to fetch");
        }
        if (url.endsWith("/api/control/status")) return json({ busy: false });
        if (url.endsWith("/api/boot")) return json(readyBoot);
        if (url.endsWith("/api/session")) return json(idleSession);
        if (url.endsWith("/api/exam")) return json(exam);
        if (url.endsWith("/api/control/banks")) return json(banks);
        return json({});
      }),
    );

    render(<App />);
    await screen.findByText("CKAD Mock Exam 01", { selector: "h1" });
    await user.click(screen.getByRole("button", { name: /CKA Mock Exam 01/ }));
    await user.click(screen.getByRole("button", { name: "Switch exam" }));

    expect(await screen.findByText(/control plane/i)).toBeInTheDocument();
    // The dialog stays open and re-armed, so the user can try again once
    // they have acted on what the toast told them.
    const confirm = screen.getByRole("button", { name: "Switch exam" });
    expect(confirm).toBeInTheDocument();
    await waitFor(() => expect(confirm).not.toBeDisabled());
  });
});

// `pollError` was written on every failed session poll and read only by
// the pre-first-session loading screen — i.e. never, after the first
// success. The app's most central fetch failed silently forever.
describe("App session polling", () => {
  test("warns when the session poll fails after the first success, and withdraws it on recovery", async () => {
    let sessionDown = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const json = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), { status });

        if (url.endsWith("/api/boot")) return json(readyBoot);
        if (url.endsWith("/api/session")) {
          if (sessionDown) throw new TypeError("Failed to fetch");
          return json(idleSession);
        }
        if (url.endsWith("/api/control/status")) return json({ busy: false });
        if (url.endsWith("/api/exam")) return json(exam);
        if (url.endsWith("/api/control/banks")) return json(banks);
        return json({});
      }),
    );

    render(<App />);
    await screen.findByText("CKAD Mock Exam 01", { selector: "h1" });

    // pollSession refetches on window focus as well as on its 10s timer —
    // the same path a candidate takes returning to the tab.
    sessionDown = true;
    window.dispatchEvent(new Event("focus"));

    expect(await screen.findByText(/cannot reach facilitator/i)).toBeInTheDocument();

    // ...and it must not outlive the outage it describes.
    sessionDown = false;
    window.dispatchEvent(new Event("focus"));
    await waitFor(() =>
      expect(screen.queryByText(/cannot reach facilitator/i)).toBeNull(),
    );
  });
});

// handleRetry is only reachable through the control overlay's Retry
// button (ControlProgress.test.tsx spies on the onRetry prop directly
// and never exercises App's real handleRetry/runControlAction wiring).
// This drives it for real: seed a failed lastJob so the overlay renders
// with Retry already showing, click it, and make the retry POST fail
// too — covering handleRetry's `op === "switch"` branch (the `startControlSwitch`
// call), the one branch runControlAction's other caller (handleNewAttempt)
// never exercises.
describe("App control retry", () => {
  test("retrying a failed job through the overlay also reports failure (handleRetry)", async () => {
    const user = userEvent.setup();
    const failedJob: ControlJob = {
      id: "job-failed-1",
      op: "switch",
      bank: "cka-mock-01",
      startedAt: "2026-07-25T12:00:00Z",
      finishedAt: "2026-07-25T12:00:05Z",
      phase: "recreate-cluster",
      error: "conductor: rebuild failed",
      phases: [
        {
          id: "end-session",
          label: "End session and lock desktop",
          state: "done",
          startedAt: "2026-07-25T12:00:00Z",
          finishedAt: "2026-07-25T12:00:02Z",
        },
        {
          id: "recreate-cluster",
          label: "Recreate Kubernetes cluster",
          state: "failed",
          startedAt: "2026-07-25T12:00:02Z",
          finishedAt: "2026-07-25T12:00:05Z",
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const json = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), { status });

        if (url.endsWith("/api/control/switch") && init?.method === "POST") {
          // The retry itself also fails: same empty 502 the proxy sends
          // when the conductor is down.
          return new Response("", { status: 502 });
        }
        // The overlay must be showing a failed job (with its Retry
        // button) from the very first poll.
        if (url.endsWith("/api/control/status")) {
          return json({ busy: false, lastJob: failedJob });
        }
        if (url.endsWith("/api/boot")) return json(readyBoot);
        if (url.endsWith("/api/session")) return json(idleSession);
        if (url.endsWith("/api/exam")) return json(exam);
        if (url.endsWith("/api/control/banks")) return json(banks);
        return json({});
      }),
    );

    render(<App />);
    const retryButton = await screen.findByRole("button", { name: "Retry" });
    await user.click(retryButton);

    const alert = await screen.findByText(/control plane/i);
    expect(alert).toBeInTheDocument();
  });
});

// The gate that fixes the dead browser tab: the facilitator now starts
// before the cluster exists, so during a cold first boot the UI must show
// what is being built instead of an empty lobby whose Start button leads
// to a half-seeded environment.
describe("App boot gate", () => {
  const bootingBoot = {
    ...readyBoot,
    state: "booting",
    phase: "seed",
    label: "Setting up the exam questions",
    detail: "question 7 of 22",
    step: 7,
  };

  function stubBoot(boot: unknown, session: SessionSnapshot = idleSession) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const json = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), { status });
        if (url.endsWith("/api/boot")) return json(boot);
        if (url.endsWith("/api/session")) return json(session);
        if (url.endsWith("/api/exam")) return json(exam);
        if (url.endsWith("/api/control/status")) return json({ busy: false });
        if (url.endsWith("/api/control/banks")) return json(banks);
        return json({});
      }),
    );
  }

  test("shows build progress instead of the lobby while the environment is still starting", async () => {
    stubBoot(bootingBoot);
    render(<App />);

    await screen.findByText("Building your exam environment");
    expect(screen.getByText("question 7 of 22")).toBeInTheDocument();
    // The lobby's Start button must not be reachable: the environment it
    // would start an attempt against does not exist yet.
    expect(screen.queryByRole("button", { name: /start/i })).not.toBeInTheDocument();
  });

  test("shows the lobby once the environment reports ready", async () => {
    stubBoot(readyBoot);
    render(<App />);

    await screen.findByText("CKAD Mock Exam 01", { selector: "h1" });
    expect(screen.queryByText("Building your exam environment")).not.toBeInTheDocument();
  });

  // `./sim down` + `./sim up` mid-attempt resumes a session whose
  // server-side timer never stopped. Covering it with a progress screen
  // would hide a clock that is still counting down.
  test("a running attempt wins over a not-ready environment", async () => {
    stubBoot(bootingBoot, {
      state: "running",
      bank: "ckad-mock-01",
      startedAt: "2026-07-25T12:00:00Z",
      durationSeconds: 7200,
      remainingSeconds: 3600,
      endReason: "",
      mode: "exam",
      untimed: false,
    });
    render(<App />);

    await waitFor(() =>
      expect(screen.queryByText("Building your exam environment")).not.toBeInTheDocument(),
    );
  });

  // A boot that died must say so, and must offer the one action that
  // actually retries it, rather than looking like a boot still in flight.
  test("reports a failed boot with its error and a retry", async () => {
    stubBoot({
      ...bootingBoot,
      state: "failed",
      phase: "cni",
      label: "Installing the pod network",
      error: "step failed: kubectl apply -f /opt/sim/calico.yaml (exit 1)",
    });
    render(<App />);

    await screen.findByText("The exam environment failed to start");
    // Scoped to the boot panel's own error line: ToastLayer's region is
    // also role="alert", so an unqualified byRole is ambiguous.
    expect(screen.getByText(/calico\.yaml/)).toHaveClass("error-text");
    expect(screen.getByRole("button", { name: "Try building again" })).toBeInTheDocument();
  });
});
