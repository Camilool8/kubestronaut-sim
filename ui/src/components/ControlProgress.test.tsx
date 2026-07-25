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
});
