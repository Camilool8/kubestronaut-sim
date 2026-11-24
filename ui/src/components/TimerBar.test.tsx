import { afterEach, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimerBar } from "./TimerBar";
import { HEADER_COMPACT_QUERY, MCQ_COMPACT_QUERY } from "../lib/useMediaQuery";
import { matchMediaMock } from "../test/setup";
import type { SessionSnapshot } from "../api";
import { strings } from "../strings";

const session: SessionSnapshot = {
  state: "running",
  bank: "kcna-mock",
  startedAt: "2026-07-31T12:00:00Z",
  durationSeconds: 5400,
  remainingSeconds: 5000,
  endReason: "",
  mode: "training",
  untimed: false,
};

const renderBar = (s: SessionSnapshot = session) =>
  render(<TimerBar session={s} fetchedAt={Date.now()} title="KCNA Mock Exam" onEndClick={() => {}} />);

describe("TimerBar", () => {
  afterEach(() => {
    matchMediaMock([]);
  });

  test("Submit is a quiet button, so the confirm dialog stays the loud step", () => {
    renderBar();
    const submit = screen.getByRole("button", { name: "Submit session" });
    expect(submit).not.toHaveClass("btn-primary");
    expect(submit).toHaveClass("btn", "navbar-submit");
  });

  test("on a desktop the full label and the mode chip sit in the bar", () => {
    renderBar();
    expect(screen.getByRole("button", { name: "Submit session" })).toHaveTextContent("Submit session");
    const chip = screen.getByText(strings.modes.training.label);
    expect(chip.closest(".navbar-tail")).not.toBeNull();
  });

  test("on a phone Submit keeps a visible label and the chip moves under the title", () => {
    matchMediaMock([HEADER_COMPACT_QUERY, MCQ_COMPACT_QUERY]);
    renderBar();
    const submit = screen.getByRole("button", { name: "Submit session" });
    expect(submit).toHaveTextContent(strings.exam.endAttemptShort);
    const chip = screen.getByText(strings.modes.training.label);
    expect(chip.closest(".navbar-tail")).toBeNull();
    expect(chip.closest(".navbar-titles")).toHaveTextContent("KCNA Mock Exam");
  });

  test("an exam-mode attempt shows no chip anywhere", () => {
    matchMediaMock([HEADER_COMPACT_QUERY, MCQ_COMPACT_QUERY]);
    renderBar({ ...session, mode: "exam" });
    expect(screen.queryByText(strings.modes.training.label)).toBeNull();
    expect(document.querySelector(".navbar-titles")).toBeNull();
  });
});
