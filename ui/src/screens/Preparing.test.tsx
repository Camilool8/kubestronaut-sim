import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Preparing } from "./Preparing";
import type { PreparingAttempt } from "../api";
import { strings } from "../strings";

const preparing = (over: Partial<PreparingAttempt> = {}): PreparingAttempt => ({
  jobId: "job-1",
  mode: "exam",
  questionCount: 17,
  startedAt: new Date(Date.now() - 5000).toISOString(),
  ...over,
});

describe("Preparing", () => {
  test("names the work, so the wait is not unexplained", () => {
    render(<Preparing preparing={preparing()} />);

    expect(screen.getByRole("heading", { name: strings.control.seedTitle })).toBeTruthy();
  });

  test("says how many tasks are being set up", () => {
    render(<Preparing preparing={preparing({ questionCount: 17 })} />);

    expect(screen.getByText(strings.preparing.body(17))).toBeTruthy();
  });

  test("promises the clock has not started, which is the candidate's real worry", () => {
    render(<Preparing preparing={preparing()} />);

    expect(screen.getByText(strings.control.hintSeed, { exact: false })).toBeTruthy();
  });

  test("reports progress to a screen reader without shouting every tick", () => {
    render(<Preparing preparing={preparing()} />);

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
  });

  test("shows which task is being set up once the control poll supplies it", () => {
    render(<Preparing preparing={preparing()} detail="question 5 of 17" />);

    expect(screen.getByText("question 5 of 17")).toBeTruthy();
  });

  test("renders without the detail, which arrives a poll later than the screen", () => {
    render(<Preparing preparing={preparing()} />);

    expect(screen.getByText(strings.preparing.body(17))).toBeTruthy();
  });

  test("survives a startedAt the server has not filled in yet", () => {
    render(<Preparing preparing={preparing({ startedAt: "" })} />);

    expect(screen.getByRole("heading", { name: strings.control.seedTitle })).toBeTruthy();
  });
});
