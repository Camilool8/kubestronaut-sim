import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BackgroundJobChip } from "./BackgroundJobChip";
import type { ControlJob } from "../api";

// Six phases, two of them done — the real switch job's shape.
const job: ControlJob = {
  id: "job-1",
  op: "switch",
  bank: "cka-mock-01",
  startedAt: "2026-07-27T12:00:00.000Z",
  phase: "recreate-cluster",
  phases: [
    { id: "end-session", label: "End session and lock desktop", state: "done" },
    { id: "wipe-instances", label: "Wipe instances", state: "done" },
    { id: "recreate-cluster", label: "Recreate Kubernetes cluster", state: "running" },
    { id: "restart-instances", label: "Restart instances", state: "pending" },
    { id: "restart-facilitator", label: "Restart exam services", state: "pending" },
    { id: "verify", label: "Verify environment", state: "pending" },
  ],
};

afterEach(() => {
  vi.useRealTimers();
});

// Pressing Escape, or "Run in background", used to leave a 2-4 minute
// cluster rebuild running with no indicator anywhere in the product. The
// lobby underneath looked entirely idle while the exam it describes was
// being wiped and rebuilt.
describe("BackgroundJobChip", () => {
  test("names the phase that is actually running", () => {
    render(<BackgroundJobChip job={job} bankTitle="CKA Mock Exam 01" onReopen={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("Recreate Kubernetes cluster");
  });

  test("reports progress by completed step, which is data already in hand", () => {
    render(<BackgroundJobChip job={job} bankTitle="CKA Mock Exam 01" onReopen={() => {}} />);
    const bar = screen.getByRole("progressbar");
    // Determinate by step, not by time — a time-weighted bar would need
    // persisted per-phase medians, which is a separate piece of work.
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuemax", "6");
    expect(bar).toHaveAccessibleName(/progress/i);
  });

  test("the elapsed clock keeps moving, which is the signal that survives reduced motion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:04.000Z"));
    render(<BackgroundJobChip job={job} bankTitle="CKA Mock Exam 01" onReopen={() => {}} />);
    expect(screen.getByText("4.0s")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(20_000);
    expect(screen.getByText("24s")).toBeInTheDocument();
  });

  test("names the exam by its catalog title, never its bank slug", () => {
    render(<BackgroundJobChip job={job} bankTitle="CKA Mock Exam 01" onReopen={() => {}} />);
    expect(screen.getByRole("button")).toHaveAccessibleName(/CKA Mock Exam 01/);
    expect(screen.getByRole("button")).not.toHaveAccessibleName(/cka-mock-01/);
  });

  test("clicking brings the full checklist back", async () => {
    const reopened = vi.fn();
    render(<BackgroundJobChip job={job} bankTitle="CKA Mock Exam 01" onReopen={reopened} />);
    await userEvent.click(screen.getByRole("button"));
    expect(reopened).toHaveBeenCalledTimes(1);
  });

  // The chip used to title ANY job carrying a bank as a switch, because a
  // resolved bankTitle was checked before the op was. Both jobs below
  // carry one, and neither is a switch: the overlay named them correctly
  // while the chip for the very same job did not.
  test("titles a first-time build as a build", () => {
    render(
      <BackgroundJobChip
        job={{ ...job, op: "provision", bank: "ckad-mock-01" }}
        bankTitle="CKAD Mock Exam 01"
        onReopen={() => {}}
      />,
    );
    const chip = screen.getByRole("button");
    expect(chip).toHaveAccessibleName(/building/i);
    expect(chip).not.toHaveAccessibleName(/switching/i);
  });

  test("titles a pooled bank's seeding as setup, not as a switch", () => {
    render(
      <BackgroundJobChip
        job={{ ...job, op: "seed", bank: "ckad-mock-01" }}
        bankTitle="CKAD Mock Exam 01"
        onReopen={() => {}}
      />,
    );
    expect(screen.getByRole("button")).not.toHaveAccessibleName(/switching/i);
  });
});
