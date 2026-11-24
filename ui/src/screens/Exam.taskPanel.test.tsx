import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Exam } from "./Exam";
import type { SessionSnapshot } from "../api";
import { marksStore } from "../components/marksStore";
import { toastStore } from "../components/toastStore";
import { TASK_PANEL_KEY } from "../components/TaskPanelToggle";
import { NARROW_QUERY } from "../lib/useMediaQuery";
import { matchMediaMock } from "../test/setup";
import { readThemeCss, ruleBody } from "../test/readCss";
import { strings } from "../strings";

vi.mock("react-markdown", () => ({
  default: ({ children }: { children?: string }) => <div data-testid="markdown">{children}</div>,
}));

vi.mock("@novnc/novnc", () => {
  class FakeRFB {
    addEventListener() {}
    removeEventListener() {}
    disconnect() {}
  }
  return { default: FakeRFB };
});

const session: SessionSnapshot = {
  state: "idle",
  bank: "ckad-mock-01",
  startedAt: "2026-07-25T12:00:00Z",
  durationSeconds: 7200,
  remainingSeconds: 600,
  endReason: "",
  mode: "exam",
  untimed: false,
};

const questions = Array.from({ length: 16 }, (_, i) => ({
  id: `q${String(i + 1).padStart(2, "0")}`,
  title: `Task ${i + 1}`,
  instance: "instance-1",
  domain: "Config",
  weight: 4,
  totalPoints: 4,
  hintCount: 0,
}));

const exam = {
  name: "ckad-mock-01",
  title: "CKAD Mock Exam 01",
  examType: "hands-on",
  durationSeconds: 7200,
  passingScore: 66,
  kubernetesVersion: "1.35",
  questionCount: questions.length,
  questions,
};

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  window.localStorage.setItem("sim.tourDone", "1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/exam")) return json(exam);
      const id = /\/api\/questions\/([^/?]+)/.exec(url)?.[1];
      if (id) return json({ id, markdown: `Body of ${id}` });
      return json({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  matchMediaMock([]);
  toastStore.clear();
  marksStore.reset();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

function renderExam() {
  return render(<Exam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);
}

const examBody = (container: HTMLElement) => container.querySelector(".exam-body")!;

describe("task panel toggle below 768px", () => {
  test("starts expanded, so the task is the first thing on screen", async () => {
    matchMediaMock([NARROW_QUERY]);
    const { container } = renderExam();
    await screen.findByTestId("markdown");

    const toggle = screen.getByRole("button", { name: strings.exam.tasksHide });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", "question-panel");
    expect(document.getElementById("question-panel")).not.toBeNull();
    expect(examBody(container)).not.toHaveAttribute("data-tasks");
  });

  test("collapses and expands on click, and focus never leaves the toggle", async () => {
    matchMediaMock([NARROW_QUERY]);
    const user = userEvent.setup();
    const { container } = renderExam();
    await screen.findByTestId("markdown");

    const toggle = screen.getByRole("button", { name: strings.exam.tasksHide });
    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent(strings.exam.tasksShow);
    expect(toggle).toHaveTextContent(strings.exam.tasksPosition(1, 16));
    expect(toggle).toHaveFocus();
    expect(examBody(container)).toHaveAttribute("data-tasks", "collapsed");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent(strings.exam.tasksHide);
    expect(toggle).not.toHaveTextContent(strings.exam.tasksPosition(1, 16));
    expect(toggle).toHaveFocus();
    expect(examBody(container)).not.toHaveAttribute("data-tasks");
  });

  test("is operable from the keyboard with Enter and Space", async () => {
    matchMediaMock([NARROW_QUERY]);
    const user = userEvent.setup();
    renderExam();
    await screen.findByTestId("markdown");

    const toggle = screen.getByRole("button", { name: strings.exam.tasksHide });
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveFocus();
  });

  test("names the task the candidate is on while collapsed", async () => {
    matchMediaMock([NARROW_QUERY]);
    const user = userEvent.setup();
    renderExam();
    await screen.findByTestId("markdown");

    await user.click(screen.getByRole("button", { name: /next question/i }));
    await user.click(screen.getByRole("button", { name: /next question/i }));
    const toggle = screen.getByRole("button", { name: strings.exam.tasksHide });
    await user.click(toggle);

    expect(toggle.textContent).toContain(strings.exam.tasksPosition(3, 16));
    expect(toggle).toHaveAccessibleName(/^Show tasks\s*,\s*Task 3 of 16$/);
  });

  test("remembers the collapsed state for the rest of the browser session", async () => {
    matchMediaMock([NARROW_QUERY]);
    const user = userEvent.setup();
    const first = renderExam();
    await screen.findByTestId("markdown");

    await user.click(screen.getByRole("button", { name: strings.exam.tasksHide }));
    expect(window.sessionStorage.getItem(TASK_PANEL_KEY)).toBe("collapsed");
    first.unmount();

    const second = renderExam();
    await screen.findByTestId("markdown");
    const toggle = screen.getByRole("button", { name: new RegExp(strings.exam.tasksShow) });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(examBody(second.container)).toHaveAttribute("data-tasks", "collapsed");

    await user.click(toggle);
    expect(window.sessionStorage.getItem(TASK_PANEL_KEY)).toBeNull();
  });

  test("pressing G while collapsed opens the panel, so the task grid is never drawn hidden", async () => {
    matchMediaMock([NARROW_QUERY]);
    window.sessionStorage.setItem(TASK_PANEL_KEY, "collapsed");
    const user = userEvent.setup();
    const { container } = renderExam();
    await screen.findByTestId("markdown");
    expect(examBody(container)).toHaveAttribute("data-tasks", "collapsed");

    await user.keyboard("g");

    expect(examBody(container)).not.toHaveAttribute("data-tasks");
    expect(screen.getByRole("button", { name: strings.exam.tasksHide })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});

describe("task panel toggle at 768px and wider", () => {
  test("is not rendered, and a remembered collapse does not hide the side-by-side panel", async () => {
    window.sessionStorage.setItem(TASK_PANEL_KEY, "collapsed");
    const { container } = renderExam();
    await screen.findByTestId("markdown");

    expect(screen.queryByRole("button", { name: new RegExp(strings.exam.tasksShow) })).toBeNull();
    expect(screen.queryByRole("button", { name: strings.exam.tasksHide })).toBeNull();
    expect(examBody(container)).not.toHaveAttribute("data-tasks");
  });
});

describe("task panel collapse styles", () => {
  test("the collapse only applies inside the narrow breakpoint", async () => {
    const css = await readThemeCss();
    const narrow = /@media \(max-width: 767px\) \{([\s\S]*?)\n\}/.exec(css);
    expect(narrow, "the 767px block holding the collapse rule was renamed or removed").not.toBeNull();
    expect(narrow![1]).toContain('.exam-body[data-tasks="collapsed"] .question-panel');
    expect(narrow![1]).toContain("visibility: hidden");

    const outside = css.replace(narrow![0], "");
    expect(
      outside.replace(/@media[^{]*prefers-reduced-motion[^{]*\{[\s\S]*?\n\}/g, ""),
      "a collapse rule outside the narrow block would hide the panel where it sits beside the desktop",
    ).not.toMatch(/data-tasks="collapsed"\] \.question-panel \{[^}]*visibility: hidden/);
  });

  test("the slide only runs for people who have not asked for reduced motion", async () => {
    const css = await readThemeCss();
    const motion = /@media \(max-width: 767px\) and \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/.exec(css);
    expect(motion).not.toBeNull();
    expect(motion![1]).toContain("transition");
  });

  test("the toggle keeps a 44px tap target", async () => {
    const css = await readThemeCss();
    expect(ruleBody(css, ".task-strip-toggle")).toContain("min-height: 44px");
  });
});
