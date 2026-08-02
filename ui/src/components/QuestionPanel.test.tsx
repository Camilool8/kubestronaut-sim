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

// Real bank markdown: the values a candidate must reproduce exactly are
// already marked up as inline code.
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
    // A typo in a resource name is an invisible zero, so each of these
    // has to be copyable rather than retyped.
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
    // The label has to say what activating it does, not just echo the value.
    expect(button).toHaveAccessibleName(/copy/i);
  });
});

// Three questions across two domains, which is the smallest fixture that
// exercises both ends of the navigator and the grid's grouping. q01
// carries a title and the others do not, because title is optional in
// the bank format and both renderings have to hold in one grid.
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
    // Wrapping q03 back to q01 under a clock that cannot be paused reads
    // as having lost your place, not as a convenience.
    expect(screen.getByRole("button", { name: /next question/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /previous question/i })).toBeEnabled();
  });

  test("the navigator says where you are, for both kinds of reader", async () => {
    renderNav("q02");
    const trigger = await screen.findByRole("button", { name: /question 2 of 3/i });
    // The glyphs are a drawn "2 / 3"; the accessible name has to be a
    // sentence, and it has to also say what activating the button does.
    expect(trigger).toHaveAccessibleName(/show all questions/i);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("] and [ step between questions", async () => {
    const selected: string[] = [];
    renderNav("q02", (id) => void selected.push(id));

    // "[[" is userEvent's escape for a literal "[" — a bare one opens a
    // key-code descriptor.
    await userEvent.keyboard("]");
    await userEvent.keyboard("[[");

    expect(selected).toEqual(["q03", "q01"]);
  });

  test("a bank title shows in the header, and its absence renders nothing", async () => {
    renderNav("q01");
    expect(await screen.findByText("Namespaces & quotas")).toBeInTheDocument();

    renderNav("q02");
    // q02 has no title: the header falls back to the id alone rather
    // than rendering an empty span or the word "undefined".
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  test("the bracket keys stay out of the way while the terminal has focus", async () => {
    const selected: string[] = [];
    const { container } = renderNav("q02", (id) => void selected.push(id));

    // The RFB canvas owns the keyboard while focused — the candidate is
    // typing into a shell, and "]" is a character, not a shortcut.
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
  // Scoped to the grid on purpose: the navigator's own trigger is also a
  // button whose name starts with the current question's id.
  async function openGrid(selectedId: string, onSelect: (id: string) => void = () => {}) {
    const { container } = renderNav(selectedId, onSelect);
    await userEvent.click(await screen.findByRole("button", { name: /show all questions/i }));
    const grid = container.querySelector<HTMLElement>("#question-jump");
    if (!grid) throw new Error("jump grid did not open");
    return within(grid);
  }

  test("every question is reachable at once", async () => {
    const grid = await openGrid("q01");
    for (const id of ["q01", "q02", "q03"]) {
      expect(grid.getByRole("button", { name: new RegExp(`^${id}`) })).toBeInTheDocument();
    }
  });

  test("what the tile has no room to draw is still said", async () => {
    const grid = await openGrid("q01");
    // Ten tiles to a row leaves one line and it belongs to the id, so the
    // bank's title, the domain, the instance and the points all travel in
    // the button's accessible name rather than being dropped.
    const tile = grid.getByRole("button", { name: /^q01/ });
    expect(tile).toHaveAccessibleName(/Namespaces & quotas/);
    expect(tile).toHaveAccessibleName(/Config/);
    expect(tile).toHaveAccessibleName(/instance-1/);
    expect(tile).toHaveAccessibleName(/5 pts/);
  });

  test("the hands-on grid prints bank ids, because its header does too", async () => {
    const grid = await openGrid("q01");
    // The mcq screen is the one that must show positions instead: there
    // the id is an artifact of the pool a random draw sampled from.
    expect(grid.getByRole("button", { name: /^q02/ })).toBeInTheDocument();
    expect(grid.queryByRole("button", { name: /^Q2\b/ })).toBeNull();
  });

  test("the current question is announced as current, not just drawn as selected", async () => {
    const grid = await openGrid("q02");
    expect(grid.getByRole("button", { name: /^q02/ })).toHaveAttribute("aria-current", "true");
    expect(grid.getByRole("button", { name: /^q01/ })).not.toHaveAttribute("aria-current");
  });

  test("picking a question closes the grid and hands focus back", async () => {
    const selected: string[] = [];
    const grid = await openGrid("q01", (id) => void selected.push(id));

    await userEvent.click(grid.getByRole("button", { name: /^q03/ }));

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

    // The same key closes it, and the focus goes back to the trigger it
    // came from rather than being dropped on <body>.
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

    // A reload mid-exam is the only reason this state is persisted at all.
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

// The identity block above the task text: which task this is, what it is
// called, and the four facts that place it. Every one of the four is
// optional at the source, and two of them (`targetSeconds`,
// `targetDerived`) arrive only from a facilitator new enough to send them.
describe("QuestionPanel task header", () => {
  test("the counter is zero-padded to the width of the total", async () => {
    renderNav("q02");
    // "TASK 02 / 3" would jump a pixel between 9 and 10 under a running
    // clock; the padding is to the total's own width, so a 3-task attempt
    // pads to one digit and a 20-task one to two.
    expect(await screen.findByText("Task 2 / 3")).toBeInTheDocument();
  });

  test("the chips place the task: domain, share of the points, host", async () => {
    renderNav("q01");
    expect(await screen.findByText("Config")).toBeInTheDocument();
    // 5 of the fixture's 21 points, rounded. Computed over the DRAWN
    // questions, so a random draw reports its own arithmetic.
    expect(screen.getByText("Weight 24%")).toBeInTheDocument();
    expect(screen.getByText("instance-1")).toBeInTheDocument();
  });

  test("no target time is sent, so no pacing chip is drawn", async () => {
    renderNav("q01");
    await screen.findByText("Config");
    // An older facilitator sends no targetSeconds at all. The chip is
    // absent rather than empty, zero, or a guess.
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

    // Authored in the bank: a plain figure, and nothing anywhere may
    // suggest running over it costs anything, because it does not.
    const authored = await screen.findByText("Target 6m");
    expect(authored).toHaveAttribute("title", expect.stringMatching(/budget, not a limit/i));
    // The one thing this copy may never do is imply a cost. It says "not
    // a limit" out loud; what it must not contain is a penalty at all.
    expect(authored).toHaveTextContent(/not a limit/i);
    expect(authored.textContent).not.toMatch(/penal|deduct|overdue|deadline|too slow/i);

    rerender(<QuestionPanel questions={timed} selectedId="q02" onSelect={() => {}} />);

    // Derived: arithmetic about weights, not a judgement of how long the
    // work takes, and it has to say so where it is read.
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

    // Per-task time measures a pane being on screen. "Spent" and "worked"
    // both claim to have measured attention, which nothing here can.
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

    // "f" is a character in a shell, not a shortcut.
    expect(marksStore.isMarked("q02")).toBe(false);
  });
});

// The machine block and the graded-on card, the two things the task pane
// says that the bank's markdown does not.
describe("QuestionPanel work-from block", () => {
  test("the ssh command is on screen and copyable in one click", async () => {
    const pasted: string[] = [];
    desktopClipboard.connect({ clipboardPasteFrom: (t) => void pasted.push(t) });

    renderNav("q02");
    const copy = await screen.findByRole("button", { name: /copy ssh instance-2/i });
    // The visible label is "Copy"; the accessible name says what gets
    // copied and contains the visible word (WCAG 2.5.3).
    expect(copy).toHaveTextContent("Copy");
    await userEvent.click(copy);

    expect(pasted).toEqual(["ssh instance-2"]);
  });

  test("what the grader will look at is stated, without claiming to know the checks", async () => {
    renderNav("q02");
    const card = await screen.findByRole("region", { name: /graded on/i });
    // The bank does not publish its check descriptions before grading, so
    // this says what is true of every task rather than inventing a
    // per-task summary — including that typing is not what is read.
    expect(card).toHaveTextContent(/not the commands you typed/i);
    expect(card).toHaveTextContent(/7 pts/);
  });
});

describe("QuestionPanel failure and pending states", () => {
  test("a question that will not load says so, and offers a way back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 502 })),
    );

    renderNav("q02");

    // Previously this rendered a bare String(err) with no role and no
    // retry — the candidate's only move was reloading a running exam.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't load this question/i);
    // The clock keeps running through this, so it has to say what is
    // still fine as well as what broke.
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

    // A question fetch against a local facilitator lands in tens of
    // milliseconds; throwing the text away for that long flashes the pane
    // on every single step between questions.
    expect(screen.getByRole("button", { name: /aurora-staging/ })).toBeInTheDocument();
  });
});
