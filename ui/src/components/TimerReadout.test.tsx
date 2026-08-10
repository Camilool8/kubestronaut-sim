import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimerReadout } from "./TimerReadout";
import { ExamGateControls } from "../screens/Exam";
import type { SessionSnapshot } from "../api";
import { strings } from "../strings";

const session: SessionSnapshot = {
  state: "running",
  bank: "ckad-mock-01",
  startedAt: "2026-07-25T12:00:00Z",
  durationSeconds: 7200,
  remainingSeconds: 500,
  endReason: "",
  mode: "exam",
  untimed: false,
};

describe("TimerReadout", () => {
  test("a clock is drawn in digits and announced in words", () => {
    const { container } = render(
      <TimerReadout untimed={false} remaining={500} elapsed={0} />,
    );

    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent("0:08:20");
    expect(screen.getByText("Time remaining: 8 minutes")).toHaveClass("sr-only");
  });

  test("an untimed attempt announces what it has spent, not what it has left", () => {
    const { container } = render(
      <TimerReadout untimed remaining={0} elapsed={125_000} />,
    );

    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent("2m 05s");
    expect(screen.getByText("Time elapsed: 2m 05s")).toHaveClass("sr-only");
    expect(screen.queryByText(/time remaining/i)).toBeNull();
  });

  test("the digits are hidden from a screen reader, so nothing is read twice", () => {
    render(<TimerReadout untimed={false} remaining={61} elapsed={0} />);

    const digits = screen.getByText("0:01:01");
    expect(digits).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(strings.exam.timeRemaining("1 minute"))).toBeInTheDocument();
  });
});

describe("the mobile gate's timer", () => {
  test("announces the same line the exam header does", () => {
    const fetchedAt = Date.now();
    render(
      <ExamGateControls session={session} fetchedAt={fetchedAt} onSessionChange={() => {}} />,
    );

    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("0:08:20");
    expect(timer).toHaveTextContent(strings.exam.timeRemaining("8 minutes"));
  });
});
