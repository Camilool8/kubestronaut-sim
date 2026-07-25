import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ControlProgress } from "./ControlProgress";
import type { ControlJob } from "../api";

const runningJob: ControlJob = {
  id: "job-1",
  op: "reset",
  bank: "",
  startedAt: "2026-07-24T12:00:00Z",
  phase: "recreate-cluster",
  phases: [
    { id: "end-session", label: "End session and lock desktop", state: "done" },
    { id: "recreate-cluster", label: "Recreate Kubernetes cluster", state: "running" },
    { id: "verify", label: "Verify environment", state: "pending" },
  ],
};

describe("ControlProgress", () => {
  test("renders every phase label with its state", () => {
    render(<ControlProgress job={runningJob} onRetry={() => {}} onDismiss={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("End session and lock desktop")).toBeInTheDocument();
    expect(screen.getByText("Recreate Kubernetes cluster")).toBeInTheDocument();
    const running = screen.getByText("Recreate Kubernetes cluster").closest("li");
    expect(running).toHaveClass("phase-running");
  });

  test("failed job surfaces the error with retry and dismiss", async () => {
    const failed: ControlJob = {
      ...runningJob,
      error: "k8s-env: exec exited 1: bootstrap: no exam.yaml",
      phases: runningJob.phases.map((p) =>
        p.id === "recreate-cluster" ? { ...p, state: "failed" as const } : p,
      ),
    };
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    render(<ControlProgress job={failed} onRetry={onRetry} onDismiss={onDismiss} />);

    expect(screen.getByText(/no exam\.yaml/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  test("in-flight job offers no buttons", () => {
    render(<ControlProgress job={runningJob} onRetry={() => {}} onDismiss={() => {}} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("running phase shows an animated spinner, settled phases don't", () => {
    render(<ControlProgress job={runningJob} onRetry={() => {}} onDismiss={() => {}} />);
    const running = screen.getByText("Recreate Kubernetes cluster").closest("li");
    expect(running?.querySelector(".phase-mark-spinner")).not.toBeNull();
    const done = screen.getByText("End session and lock desktop").closest("li");
    expect(done?.querySelector(".phase-mark-spinner")).toBeNull();
    const pending = screen.getByText("Verify environment").closest("li");
    expect(pending?.querySelector(".phase-mark-spinner")).toBeNull();
  });
});
