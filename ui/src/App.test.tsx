import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import type { ControlJob, ControlStatus, SessionSnapshot } from "./api";

const idleSession: SessionSnapshot = {
  state: "idle",
  bank: "ckad-mock-01",
  startedAt: "",
  durationSeconds: 7200,
  remainingSeconds: 0,
  endReason: "",
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
