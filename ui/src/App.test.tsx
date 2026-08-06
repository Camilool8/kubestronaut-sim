import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import type { ControlJob, ControlStatus, SessionSnapshot } from "./api";
import { toastStore } from "./components/toastStore";
import { NARROW_QUERY } from "./lib/useMediaQuery";
import { TOUCH_ONLY_QUERY } from "./lib/deviceCapability";
import { matchMediaMock } from "./test/setup";

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

const noProgress = { attempts: 0, counted: 0, passed: false, weakDomains: [] };
const catalog = {
  active: "ckad-mock-01",
  exams: [
    {
      id: "ckad-mock-01",
      title: "CKAD Mock Exam 01",
      examType: "hands-on",
      available: true,
      progress: noProgress,
    },
    {
      id: "cka-mock-01",
      title: "CKA Mock Exam 01",
      examType: "hands-on",
      available: true,
      progress: noProgress,
    },
  ],
  summary: { attempts: 0, passedCount: 0, trackCount: 5, weakDomains: [] },
};

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

      if (url.endsWith("/api/me")) return json({ error: "not found" }, 404);
      if (url.endsWith("/api/boot")) return json(readyBoot);
      if (url.endsWith("/api/session")) return json(idleSession);
      if (url.endsWith("/api/exam")) return json(exam);
      if (url.endsWith("/api/catalog")) return json(catalog);
      return json({});
    }),
  );
}

beforeEach(() => {
  controlStatus = { busy: false };
  stubFetch();

  toastStore.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("App control polling", () => {
  test("re-polls immediately when a job starts instead of waiting out the idle timer", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Path to Kubestronaut", { selector: "h1" });

    await waitFor(() => expect(statusPolls).toBeGreaterThan(0));
    const pollsBeforeSwitch = statusPolls;
    controlStatus = runningStatus;

    const card = screen.getByRole("heading", { name: "CKA Mock Exam 01" }).closest("article") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "Choose a mode" }));
    await user.click(screen.getByRole("button", { name: "Load it" }));

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

const results = {
  percent: 0,
  passed: false,
  earned: 0,
  total: 17,
  passingScore: 66,
  questions: [],
};

describe("App control failures", () => {
  test("tells the user when a control action is refused instead of doing nothing", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const json = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), { status });

        if (url.endsWith("/api/control/reset") && init?.method === "POST") {
          return new Response("", { status: 502 });
        }
        if (url.endsWith("/api/control/status")) return json({ busy: false });
        if (url.endsWith("/api/boot")) return json(readyBoot);
        if (url.endsWith("/api/session")) return json(endedSession);
        if (url.endsWith("/api/results")) return json(results);
        if (url.endsWith("/api/exam")) return json(exam);
        if (url.endsWith("/api/catalog")) return json(catalog);
        return json({});
      }),
    );

    render(<App />);
    const button = await screen.findByRole("button", { name: "New attempt" });
    await user.click(button);

    const alert = await screen.findByText(/control plane/i);
    expect(alert).toBeInTheDocument();
  });

  test("tells the user when the control request itself fails, not just when it resolves ok:false", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const json = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), { status });

        if (url.endsWith("/api/control/reset") && init?.method === "POST") {
          throw new TypeError("Failed to fetch");
        }
        if (url.endsWith("/api/control/status")) return json({ busy: false });
        if (url.endsWith("/api/boot")) return json(readyBoot);
        if (url.endsWith("/api/session")) return json(endedSession);
        if (url.endsWith("/api/results")) return json(results);
        if (url.endsWith("/api/exam")) return json(exam);
        if (url.endsWith("/api/catalog")) return json(catalog);
        return json({});
      }),
    );

    render(<App />);
    const button = await screen.findByRole("button", { name: "New attempt" });
    await user.click(button);

    const alert = await screen.findByText(/control plane/i);
    expect(alert).toBeInTheDocument();
  });

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
        if (url.endsWith("/api/catalog")) return json(catalog);
        return json({});
      }),
    );

    render(<App />);
    await screen.findByText("Path to Kubestronaut", { selector: "h1" });
    const card = screen.getByRole("heading", { name: "CKA Mock Exam 01" }).closest("article") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "Choose a mode" }));
    await user.click(screen.getByRole("button", { name: "Load it" }));

    expect(await screen.findByText(/control plane/i)).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: "Load it" });
    expect(confirm).toBeInTheDocument();
    await waitFor(() => expect(confirm).not.toBeDisabled());
  });
});

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
        if (url.endsWith("/api/catalog")) return json(catalog);
        return json({});
      }),
    );

    render(<App />);
    await screen.findByText("Path to Kubestronaut", { selector: "h1" });

    sessionDown = true;
    window.dispatchEvent(new Event("focus"));

    expect(await screen.findByText(/cannot reach facilitator/i)).toBeInTheDocument();

    sessionDown = false;
    window.dispatchEvent(new Event("focus"));
    await waitFor(() =>
      expect(screen.queryByText(/cannot reach facilitator/i)).toBeNull(),
    );
  });
});

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
          return new Response("", { status: 502 });
        }

        if (url.endsWith("/api/control/status")) {
          return json({ busy: false, lastJob: failedJob });
        }
        if (url.endsWith("/api/boot")) return json(readyBoot);
        if (url.endsWith("/api/session")) return json(idleSession);
        if (url.endsWith("/api/exam")) return json(exam);
        if (url.endsWith("/api/catalog")) return json(catalog);
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
        if (url.endsWith("/api/catalog")) return json(catalog);
        return json({});
      }),
    );
  }

  test("shows build progress instead of the lobby while the environment is still starting", async () => {
    stubBoot(bootingBoot);
    render(<App />);

    await screen.findByText("Building your exam environment");
    expect(screen.getByText("question 7 of 22")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /start/i })).not.toBeInTheDocument();
  });

  test("shows the lobby once the environment reports ready", async () => {
    stubBoot(readyBoot);
    render(<App />);

    await screen.findByText("Path to Kubestronaut", { selector: "h1" });
    expect(screen.queryByText("Building your exam environment")).not.toBeInTheDocument();
  });

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

    expect(screen.getByText(/calico\.yaml/)).toHaveClass("error-text");
    expect(screen.getByRole("button", { name: "Try building again" })).toBeInTheDocument();
  });
});

describe("App preparing an attempt", () => {
  const preparingSession: SessionSnapshot = {
    ...idleSession,
    preparing: {
      jobId: "job-7",
      mode: "exam",
      questionCount: 16,
      startedAt: "2026-08-02T10:14:03Z",
      seed: "a1b2c3",
    },
  };

  const runningSession: SessionSnapshot = {
    ...idleSession,
    state: "running",
    startedAt: "2026-08-02T10:16:00Z",
    remainingSeconds: 7200,
  };

  const seedJob: ControlJob = {
    id: "job-7",
    op: "seed",
    bank: "ckad-mock-01",
    startedAt: "2026-08-02T10:14:03Z",
    phase: "seed-questions",
    phases: [
      {
        id: "seed-questions",
        label: "Set up the exam questions",
        state: "running",
        detail: "question 3 of 16",
        startedAt: "2026-08-02T10:14:03Z",
      },
    ],
  };

  function stubSessions(queue: SessionSnapshot[]) {
    let served = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const json = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), { status });
        if (url.endsWith("/api/control/status")) return json(controlStatus);
        if (url.endsWith("/api/boot")) return json(readyBoot);
        if (url.endsWith("/api/session")) {
          const next = queue[Math.min(served, queue.length - 1)];
          served++;
          return json(next);
        }
        if (url.endsWith("/api/exam")) return json(exam);
        if (url.endsWith("/api/catalog")) return json(catalog);
        return json({});
      }),
    );
  }

  test("names the seed for what it is, and says the clock is not running", async () => {
    controlStatus = { busy: true, job: seedJob };
    stubSessions([preparingSession]);
    render(<App />);

    await screen.findByText("Setting up your tasks");
    expect(screen.getByText(/clock has not started/)).toBeInTheDocument();
    expect(screen.queryByText("Rebuilding your exam environment")).not.toBeInTheDocument();
  });

  test("routes into the exam when the preparation clears", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    controlStatus = { busy: true, job: seedJob };
    stubSessions([preparingSession, preparingSession, runningSession]);
    render(<App />);

    await screen.findByText("Setting up your tasks");

    expect(await screen.findByRole("timer", {}, { timeout: 4000 })).toBeInTheDocument();
  });

  test("says a failed preparation cost no time", async () => {
    controlStatus = { busy: false };
    stubSessions([{ ...idleSession, prepareError: "seeding q03 failed (exit 1)" }]);
    render(<App />);

    expect(await screen.findByText(/no time was used/)).toBeInTheDocument();
    expect(screen.getByText(/seeding q03 failed/)).toBeInTheDocument();
  });
});

describe("App choosing the exam screen", () => {
  const runningSession: SessionSnapshot = {
    ...idleSession,
    state: "running",
    startedAt: "2026-08-02T10:16:00Z",
    remainingSeconds: 7200,
  };

  const mcqExam = {
    ...exam,
    name: "kcna-mock-01",
    title: "KCNA Mock Exam",
    examType: "mcq",
    questions: [
      { id: "q01", domain: "Kubernetes Fundamentals", multi: false, hintCount: 0 },
    ],
  };

  function stubRunning(examBody: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const json = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), { status });
        if (url.endsWith("/api/me")) return json({ error: "not found" }, 404);
        if (url.endsWith("/api/control/status")) return json({ busy: false });
        if (url.endsWith("/api/boot")) return json(readyBoot);
        if (url.endsWith("/api/session")) return json(runningSession);
        if (url.endsWith("/api/answers")) return json({});
        if (url.endsWith("/api/exam")) return json(examBody);
        if (url.includes("/api/questions/")) {
          return json({ markdown: "Which one?", options: ["A thing", "Another"] });
        }
        if (url.endsWith("/api/catalog")) return json(catalog);
        return json({});
      }),
    );
  }

  afterEach(() => {
    matchMediaMock([]);
  });

  test("a phone sitting a multiple-choice exam gets the exam, not the gate", async () => {
    matchMediaMock([NARROW_QUERY, TOUCH_ONLY_QUERY]);
    stubRunning(mcqExam);
    render(<App />);

    expect(await screen.findByText("Which one?")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /needs a desktop/i })).toBeNull();
  });

  test("a phone sitting a hands-on exam gets the gate, and can still submit", async () => {
    matchMediaMock([NARROW_QUERY, TOUCH_ONLY_QUERY]);
    stubRunning(exam);
    render(<App />);

    expect(
      await screen.findByRole("heading", { level: 1, name: /needs a desktop/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit exam" })).toBeInTheDocument();

    expect(screen.getByRole("timer")).toBeInTheDocument();
  });
});
