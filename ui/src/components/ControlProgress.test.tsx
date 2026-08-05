import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ControlProgress } from "./ControlProgress";
import type { ControlJob } from "../api";

// A job mid-rebuild: two phases settled with real durations, the long
// one running, the rest untouched.
const runningJob: ControlJob = {
  id: "job-1",
  op: "reset",
  bank: "",
  startedAt: "2026-07-24T12:00:00.000Z",
  phase: "recreate-cluster",
  phases: [
    {
      id: "end-session",
      label: "End session and lock desktop",
      state: "done",
      startedAt: "2026-07-24T12:00:00.000Z",
      finishedAt: "2026-07-24T12:00:02.100Z",
    },
    {
      id: "recreate-cluster",
      label: "Recreate Kubernetes cluster",
      state: "running",
      startedAt: "2026-07-24T12:00:02.100Z",
    },
    { id: "verify", label: "Verify environment", state: "pending" },
  ],
};

const noop = () => {};
const props = { onRetry: noop, onDismiss: noop, onBackground: noop };

// These tests assert on interaction, not on rendered durations, so they
// step off the pinned clock — userEvent's internal delays never settle
// against fake timers.
const setupUser = () => {
  vi.useRealTimers();
  return userEvent.setup();
};

beforeEach(() => {
  // Pin "now" 64s into the running phase so elapsed values are stable.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-24T12:01:06.100Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ControlProgress", () => {
  test("renders every phase label with its state", () => {
    render(<ControlProgress job={runningJob} {...props} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("End session and lock desktop")).toBeInTheDocument();
    const running = screen.getByText("Recreate Kubernetes cluster").closest("li");
    expect(running).toHaveClass("phase-running");
  });

  test("running phase shows an animated spinner, settled phases don't", () => {
    render(<ControlProgress job={runningJob} {...props} />);
    const running = screen.getByText("Recreate Kubernetes cluster").closest("li");
    expect(running?.querySelector(".phase-mark-spinner")).not.toBeNull();
    const done = screen.getByText("End session and lock desktop").closest("li");
    expect(done?.querySelector(".phase-mark-spinner")).toBeNull();
  });

  test("a settled phase shows its final duration", () => {
    render(<ControlProgress job={runningJob} {...props} />);
    const done = screen.getByText("End session and lock desktop").closest("li");
    expect(done).toHaveTextContent("2.1s");
  });

  test("the running phase ticks a live duration, and pending phases show none", () => {
    render(<ControlProgress job={runningJob} {...props} />);
    const running = screen.getByText("Recreate Kubernetes cluster").closest("li");
    expect(running).toHaveTextContent("1m 04s");

    const pending = screen.getByText("Verify environment").closest("li");
    expect(pending?.textContent).not.toMatch(/\d+s/);
  });

  test("shows the cluster-rebuild hint when the job has a recreate-cluster phase", () => {
    render(<ControlProgress job={runningJob} {...props} />);
    expect(screen.getByText(/Rebuilding the Kubernetes cluster/)).toBeInTheDocument();
  });

  test("shows the fast hint for a job with no recreate-cluster phase (mcq reset/switch)", () => {
    const mcqJob: ControlJob = {
      ...runningJob,
      phases: [
        { id: "end-session", label: "End session and clear answers", state: "done" },
        { id: "verify", label: "Verify environment", state: "running", startedAt: runningJob.startedAt },
      ],
    };
    render(<ControlProgress job={mcqJob} {...props} />);
    expect(screen.queryByText(/Rebuilding the Kubernetes cluster/)).not.toBeInTheDocument();
    expect(screen.getByText(/Restarting the exam services/)).toBeInTheDocument();
  });

  test("the running phase surfaces the command's latest output line", () => {
    const withDetail: ControlJob = {
      ...runningJob,
      phases: runningJob.phases.map((p) =>
        p.id === "recreate-cluster" ? { ...p, detail: "Installing CNI" } : p,
      ),
    };
    render(<ControlProgress job={withDetail} {...props} />);
    expect(screen.getByText("Installing CNI")).toBeInTheDocument();
  });

  test("the facilitator restart is announced as a reconnect, not a freeze", () => {
    const restarting: ControlJob = {
      ...runningJob,
      op: "switch",
      bank: "cka-mock-01",
      phase: "restart-facilitator",
      phases: [
        { id: "end-session", label: "End session", state: "done" },
        {
          id: "restart-facilitator",
          label: "Restart exam services",
          state: "running",
          startedAt: "2026-07-24T12:01:00.000Z",
        },
      ],
    };
    render(<ControlProgress job={restarting} {...props} />);
    expect(screen.getByText(/reconnect/i)).toBeInTheDocument();
  });

  test("an in-flight job can be sent to the background but not dismissed", async () => {
    const user = setupUser();
    const onBackground = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ControlProgress
        job={runningJob}
        onRetry={noop}
        onDismiss={onDismiss}
        onBackground={onBackground}
      />,
    );
    // A modal with no reachable control is a keyboard dead end for the
    // several minutes a rebuild takes.
    await user.click(screen.getByRole("button", { name: /background/i }));
    expect(onBackground).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  test("failed job surfaces the error with retry and dismiss", async () => {
    const user = setupUser();
    const failed: ControlJob = {
      ...runningJob,
      error: "k8s-env: exec exited 1: bootstrap: no exam.yaml",
      phases: runningJob.phases.map((p) =>
        p.id === "recreate-cluster" ? { ...p, state: "failed" as const } : p,
      ),
    };
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ControlProgress
        job={failed}
        onRetry={onRetry}
        onDismiss={onDismiss}
        onBackground={noop}
      />,
    );

    expect(screen.getByText(/no exam\.yaml/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  test("the switch title names the exam, never the bank slug", () => {
    const job: ControlJob = { ...runningJob, op: "switch", bank: "cka-mock-01" };
    render(<ControlProgress job={job} bankTitle="CKA Mock Exam 01" {...props} />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName(/CKA Mock Exam 01/);
    expect(screen.queryByText(/cka-mock-01/)).not.toBeInTheDocument();
  });

  test("progress is announced once per phase, not once per tick", () => {
    render(<ControlProgress job={runningJob} {...props} />);
    // One polite status line carries the current step; the ticking
    // numbers must not live inside a live region or a screen reader
    // hears them every second for four minutes.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/Recreate Kubernetes cluster/);
    expect(status).not.toHaveTextContent("1m 04s");
  });

  test("the build log opens on demand and shows the retained output", async () => {
    const user = setupUser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ jobId: "job-1", lines: [" • Preparing nodes ...", " • Installing CNI ..."] }),
          { status: 200 },
        ),
      ),
    );
    try {
      render(<ControlProgress job={runningJob} {...props} />);

      // Closed by default, and no fetch until opened: the checklist is
      // the summary, the log is the appendix.
      expect(screen.queryByText(/Preparing nodes/)).not.toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();

      await user.click(screen.getByText(/show build log/i));
      expect(await screen.findByText(/Preparing nodes/)).toBeInTheDocument();
      expect(screen.getByText(/Installing CNI/)).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Nothing is built until an exam is chosen, so the first choice runs a
  // job that has no outgoing exam behind it. It reaches this dialog
  // through the same overlay as every other job, and if it borrowed the
  // switch's wording the first thing a new candidate would read is that
  // their environment is being wiped and replaced.
  describe("the first exam an environment is given", () => {
    const provisionJob: ControlJob = {
      id: "job-2",
      op: "provision",
      bank: "ckad-mock-01",
      startedAt: "2026-07-24T12:00:00.000Z",
      phase: "recreate-cluster",
      phases: [
        {
          id: "write-bank",
          label: "Select the exam",
          state: "done",
          startedAt: "2026-07-24T12:00:00.000Z",
          finishedAt: "2026-07-24T12:00:00.100Z",
        },
        {
          id: "recreate-cluster",
          label: "Build the Kubernetes cluster",
          state: "running",
          startedAt: "2026-07-24T12:00:00.100Z",
        },
        { id: "verify", label: "Verify the exam is live", state: "pending" },
      ],
    };

    test("is titled as a build, not as a switch", () => {
      render(<ControlProgress job={provisionJob} bankTitle="CKAD Mock Exam 01" {...props} />);
      const heading = screen.getByRole("heading", { level: 2 });
      expect(heading).toHaveTextContent(/building/i);
      expect(heading).toHaveTextContent("CKAD Mock Exam 01");
      expect(heading).not.toHaveTextContent(/switch/i);
    });

    test("promises the same minutes without claiming anything is being rebuilt", () => {
      render(<ControlProgress job={provisionJob} bankTitle="CKAD Mock Exam 01" {...props} />);
      const hint = document.querySelector(".control-hint");
      expect(hint).toHaveTextContent(/2-4 minutes/);
      expect(hint).not.toHaveTextContent(/rebuild/i);
    });

    test("retries as itself: the handler is given the op, and it carries a bank", async () => {
      const onRetry = vi.fn();
      const user = setupUser();
      render(
        <ControlProgress
          job={{ ...provisionJob, error: "kind: failed to create cluster" }}
          bankTitle="CKAD Mock Exam 01"
          {...props}
          onRetry={onRetry}
        />,
      );
      // A failed provision must offer retry — unlike a seed, whose retry
      // would tear down an environment the candidate still has.
      await user.click(screen.getByRole("button", { name: /retry/i }));
      expect(onRetry).toHaveBeenCalled();
    });
  });
});
