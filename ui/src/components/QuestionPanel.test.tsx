import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionPanel } from "./QuestionPanel";
import { desktopClipboard } from "../lib/desktopClipboard";
import { toastStore } from "./toastStore";
import { marksStore } from "./marksStore";
import type { ExamQuestionInfo } from "../api";

const questions: ExamQuestionInfo[] = [
  { id: "q01", instance: "instance-1", domain: "Config", weight: 5, totalPoints: 5, hintCount: 0 },
];

const markdown = [
  "Create a Namespace `aurora-staging` labeled `team=aurora`.",
  "",
  "Save the list to `/opt/course/1/aurora-namespaces`.",
].join("\n");

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ id: "q01", markdown }), { status: 200 })),
  );
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(async () => {}) },
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  toastStore.clear();
  marksStore.reset();
  window.sessionStorage.clear();
});

function renderPanel() {
  return render(
    <QuestionPanel
      questions={questions}
      selectedId="q01"
      onSelect={() => {}}
    />,
  );
}

describe("QuestionPanel copy affordance", () => {
  test("every inline value in a question is a real button", async () => {
    renderPanel();

    for (const value of ["aurora-staging", "team=aurora", "/opt/course/1/aurora-namespaces"]) {
      expect(await screen.findByRole("button", { name: new RegExp(value) })).toBeInTheDocument();
    }
  });

  test("clicking a value sends it to the exam desktop", async () => {
    const pasted: string[] = [];
    desktopClipboard.connect({ clipboardPasteFrom: (t) => void pasted.push(t) });

    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: /aurora-staging/ }));

    expect(pasted).toEqual(["aurora-staging"]);
  });

  test("a copy is confirmed, so the click isn't silent", async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: /team=aurora/ }));
    expect(toastStore.list().map((t) => t.message).join(" ")).toMatch(/copied/i);
  });

  test("the copy button is reachable and named for screen readers", async () => {
    renderPanel();
    const button = await screen.findByRole("button", { name: /aurora-staging/ });

    expect(button).toHaveAccessibleName(/copy/i);
  });
});

const bank: ExamQuestionInfo[] = [
  { id: "q01", title: "Namespaces & quotas", instance: "instance-1", domain: "Config", weight: 5, totalPoints: 5, hintCount: 0 },
  { id: "q02", instance: "instance-2", domain: "Networking", weight: 7, totalPoints: 7, hintCount: 0 },
  { id: "q03", instance: "instance-2", domain: "Networking", weight: 9, totalPoints: 9, hintCount: 0 },
];

function renderNav(selectedId: string, onSelect: (id: string) => void = () => {}) {
  return render(
    <QuestionPanel
      questions={bank}
      selectedId={selectedId}
      onSelect={onSelect}
    />,
  );
}

describe("QuestionPanel navigator", () => {
  test("prev and next stop at the ends instead of wrapping", async () => {
    const { rerender } = renderNav("q01");
    expect(await screen.findByRole("button", { name: /previous question/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next question/i })).toBeEnabled();

    rerender(
      <QuestionPanel
        questions={bank}
        selectedId="q03"
        onSelect={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /next question/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /previous question/i })).toBeEnabled();
  });

  test("the navigator says where you are, for both kinds of reader", async () => {
    renderNav("q02");
    const trigger = await screen.findByRole("button", { name: /question 2 of 3/i });

    expect(trigger).toHaveAccessibleName(/show all questions/i);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("] and [ step between questions", async () => {
    const selected: string[] = [];
    renderNav("q02", (id) => void selected.push(id));

    await userEvent.keyboard("]");
    await userEvent.keyboard("[[");

    expect(selected).toEqual(["q03", "q01"]);
  });

  test("a bank title shows in the header, and its absence renders nothing", async () => {
    renderNav("q01");
    expect(await screen.findByText("Namespaces & quotas")).toBeInTheDocument();

    renderNav("q02");

    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  test("the bracket keys stay out of the way while the terminal has focus", async () => {
    const selected: string[] = [];
    const { container } = renderNav("q02", (id) => void selected.push(id));

    const desktop = document.createElement("div");
    desktop.className = "desktop-pane";
    const target = document.createElement("button");
    desktop.appendChild(target);
    container.appendChild(desktop);
    target.focus();

    await userEvent.keyboard("]");

    expect(selected).toEqual([]);
  });
});

describe("QuestionPanel jump grid", () => {
  async function openGrid(selectedId: string, onSelect: (id: string) => void = () => {}) {
    const { container } = renderNav(selectedId, onSelect);
    await userEvent.click(await screen.findByRole("button", { name: /show all questions/i }));
    const grid = container.querySelector<HTMLElement>("#question-jump");
    if (!grid) throw new Error("jump grid did not open");
    return within(grid);
  }

  test("every question is reachable at once", async () => {
    const grid = await openGrid("q01");
    for (const n of ["1", "2", "3"]) {
      expect(grid.getByRole("button", { name: new RegExp(`^${n}\\b`) })).toBeInTheDocument();
    }
  });

  test("what the tile has no room to draw is still said", async () => {
    const grid = await openGrid("q01");

    const tile = grid.getByRole("button", { name: /^1\b/ });
    expect(tile).toHaveAccessibleName(/Namespaces & quotas/);
    expect(tile).toHaveAccessibleName(/Config/);
    expect(tile).toHaveAccessibleName(/instance-1/);
    expect(tile).toHaveAccessibleName(/5 pts/);
  });

  test("the grid prints task positions, the same as the counter above it", async () => {
    const grid = await openGrid("q01");

    expect(grid.getByRole("button", { name: /^2\b/ })).toBeInTheDocument();
    expect(grid.queryByRole("button", { name: /^q02/ })).toBeNull();
  });

  test("the current question is announced as current, not just drawn as selected", async () => {
    const grid = await openGrid("q02");
    expect(grid.getByRole("button", { name: /^2\b/ })).toHaveAttribute("aria-current", "true");
    expect(grid.getByRole("button", { name: /^1\b/ })).not.toHaveAttribute("aria-current");
  });

  test("picking a question closes the grid and hands focus back", async () => {
    const selected: string[] = [];
    const grid = await openGrid("q01", (id) => void selected.push(id));

    await userEvent.click(grid.getByRole("button", { name: /^3\b/ }));

    expect(selected).toEqual(["q03"]);
    expect(document.querySelector("#question-jump")).toBeNull();
    expect(screen.getByRole("button", { name: /show all questions/i })).toHaveFocus();
  });

  test("Escape closes the grid without ending the exam", async () => {
    await openGrid("q01");
    await userEvent.keyboard("{Escape}");
    expect(document.querySelector("#question-jump")).toBeNull();
  });

  test("G opens and closes the grid, so the strip along its foot is true", async () => {
    renderNav("q01");
    await screen.findByRole("button", { name: /show all questions/i });

    await userEvent.keyboard("g");
    expect(document.querySelector("#question-jump")).not.toBeNull();

    await userEvent.keyboard("g");
    expect(document.querySelector("#question-jump")).toBeNull();
    expect(screen.getByRole("button", { name: /show all questions/i })).toHaveFocus();
  });
});

describe("QuestionPanel review marks", () => {
  test("opening a question records it as viewed, and the flag survives a remount", async () => {
    marksStore.setScope("2026-07-27T10:00:00Z");
    const { unmount } = renderNav("q02");
    await screen.findByRole("button", { name: /show all questions/i });

    unmount();
    marksStore.reset();
    marksStore.setScope("2026-07-27T10:00:00Z");

    expect(marksStore.isViewed("q02")).toBe(true);
    expect(marksStore.isViewed("q03")).toBe(false);
  });

  test("a new attempt starts with a clean slate", async () => {
    marksStore.setScope("2026-07-27T10:00:00Z");
    renderNav("q02");
    await screen.findByRole("button", { name: /show all questions/i });

    marksStore.setScope("2026-07-27T11:30:00Z");

    expect(marksStore.isViewed("q02")).toBe(false);
  });

  test("marking for review is a toggle the candidate owns", async () => {
    marksStore.setScope("2026-07-27T10:00:00Z");
    renderNav("q02");

    const mark = await screen.findByRole("button", { name: /mark for review/i });
    expect(mark).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(mark);
    expect(mark).toHaveAttribute("aria-pressed", "true");
    expect(marksStore.isMarked("q02")).toBe(true);

    await userEvent.click(mark);
    expect(mark).toHaveAttribute("aria-pressed", "false");
  });
});

describe("QuestionPanel task header", () => {
  test("the counter is zero-padded to the width of the total", async () => {
    renderNav("q02");

    expect(await screen.findByText("Task 2 / 3")).toBeInTheDocument();
  });

  test("the chips place the task: domain, share of the points, host", async () => {
    renderNav("q01");
    expect(await screen.findByText("Config")).toBeInTheDocument();

    expect(screen.getByText("Weight 24%")).toBeInTheDocument();
    expect(screen.getByText("instance-1")).toBeInTheDocument();
  });

  test("no target time is sent, so no pacing chip is drawn", async () => {
    renderNav("q01");
    await screen.findByText("Config");

    expect(screen.queryByText(/^Target/)).not.toBeInTheDocument();
  });

  test("a target time is a budget, and a derived one says it is derived", async () => {
    const timed: ExamQuestionInfo[] = [
      { ...bank[0], targetSeconds: 360 },
      { ...bank[1], targetSeconds: 420, targetDerived: true },
      bank[2],
    ];
    const { rerender } = render(
      <QuestionPanel questions={timed} selectedId="q01" onSelect={() => {}} />,
    );

    const authored = await screen.findByText("Target 6m");
    expect(authored).toHaveAttribute("title", expect.stringMatching(/budget, not a limit/i));

    expect(authored).toHaveTextContent(/not a limit/i);
    expect(authored.textContent).not.toMatch(/penal|deduct|overdue|deadline|too slow/i);

    rerender(<QuestionPanel questions={timed} selectedId="q02" onSelect={() => {}} />);

    const derived = await screen.findByText("Target ≈7m");
    expect(derived).toHaveAttribute("title", expect.stringMatching(/derived/i));
    expect(derived).toHaveTextContent(/derived from this task's share of the exam clock/i);
  });

  test("time is about the pane being open, never about effort", async () => {
    const timed: ExamQuestionInfo[] = [{ ...bank[0], targetSeconds: 360 }, bank[1], bank[2]];
    const { container } = render(
      <QuestionPanel questions={timed} selectedId="q01" onSelect={() => {}} />,
    );
    await screen.findByText("Target 6m");

    expect(container.textContent).not.toMatch(/\bspent\b|\bworked\b|\beffort\b/i);
  });

  test("F flags the task you are reading, not just the tile you are on", async () => {
    marksStore.setScope("2026-07-27T10:00:00Z");
    renderNav("q02");
    const mark = await screen.findByRole("button", { name: /mark for review/i });
    expect(mark).toHaveAttribute("aria-pressed", "false");

    await userEvent.keyboard("f");

    expect(mark).toHaveAttribute("aria-pressed", "true");
    expect(marksStore.isMarked("q02")).toBe(true);
  });

  test("F stays out of the way while the terminal has focus", async () => {
    marksStore.setScope("2026-07-27T10:00:00Z");
    const { container } = renderNav("q02");
    await screen.findByRole("button", { name: /mark for review/i });

    const desktop = document.createElement("div");
    desktop.className = "desktop-pane";
    const target = document.createElement("button");
    desktop.appendChild(target);
    container.appendChild(desktop);
    target.focus();

    await userEvent.keyboard("f");

    expect(marksStore.isMarked("q02")).toBe(false);
  });
});

describe("QuestionPanel work-from block", () => {
  test("the ssh command is on screen and copyable in one click", async () => {
    const pasted: string[] = [];
    desktopClipboard.connect({ clipboardPasteFrom: (t) => void pasted.push(t) });

    renderNav("q02");
    const copy = await screen.findByRole("button", { name: /copy ssh instance-2/i });

    expect(copy).toHaveTextContent("Copy");
    await userEvent.click(copy);

    expect(pasted).toEqual(["ssh instance-2"]);
  });

  test("the pane does not repeat exam methodology on every task", async () => {
    renderNav("q02");
    await screen.findByRole("button", { name: /copy ssh instance-2/i });

    expect(screen.queryByRole("region", { name: /graded on/i })).toBeNull();
    expect(screen.queryByText(/not the commands you typed/i)).toBeNull();
    expect(screen.queryByText(/no context to switch/i)).toBeNull();
  });
});

describe("QuestionPanel failure and pending states", () => {
  test("a question that will not load says so, and offers a way back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 502 })),
    );

    renderNav("q02");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't load this question/i);

    expect(alert).toHaveTextContent(/timer are unaffected/i);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  test("switching question does not blank the text that is already readable", async () => {
    const { rerender } = renderNav("q02");
    await screen.findByRole("button", { name: /aurora-staging/ });

    rerender(
      <QuestionPanel
        questions={bank}
        selectedId="q03"
        onSelect={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /aurora-staging/ })).toBeInTheDocument();
  });
});
