import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { ExamTabTitle } from "./ExamTabTitle";
import type { SessionSnapshot } from "../api";
import { tabTitle } from "../lib/useDocumentTitle";

const session: SessionSnapshot = {
  state: "running",
  bank: "cka-mock-01",
  startedAt: "2026-08-02T10:00:00Z",
  durationSeconds: 7200,
  remainingSeconds: 3377,
  endReason: "",
  mode: "exam",
  untimed: false,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-02T10:03:43.000Z"));
  document.title = "kubestronaut-sim";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ExamTabTitle", () => {
  test("puts the live countdown in the tab, one tick per second", () => {
    render(<ExamTabTitle session={session} fetchedAt={Date.now()} label="CKA" />);
    expect(document.title).toBe("0:56:17 · CKA");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(document.title).toBe("0:56:16 · CKA");

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(document.title).toBe("0:56:16 · CKA");
  });

  test("an untimed attempt names the mode instead of a clock", () => {
    render(
      <ExamTabTitle
        session={{ ...session, mode: "training", untimed: true, remainingSeconds: 0 }}
        fetchedAt={Date.now()}
        label="CKA"
      />,
    );
    expect(document.title).toBe("Training · CKA");
  });

  test("falls back to the product name before the exam has loaded", () => {
    render(<ExamTabTitle session={session} fetchedAt={Date.now()} label="" />);
    expect(document.title).toBe("0:56:17 · kubestronaut-sim");
  });
});

describe("tabTitle", () => {
  test("joins what it is given and drops the blanks", () => {
    expect(tabTitle("Results", "", undefined, "CKA")).toBe("Results · CKA");
    expect(tabTitle()).toBe("kubestronaut-sim");
  });
});
