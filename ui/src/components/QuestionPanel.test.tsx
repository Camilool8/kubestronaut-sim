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
      open
      onToggle={() => {}}
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
// exercises both ends of the navigator and the grid's grouping.
const bank: ExamQuestionInfo[] = [
  { id: "q01", instance: "instance-1", domain: "Config", weight: 5, totalPoints: 5, hintCount: 0 },
  { id: "q02", instance: "instance-2", domain: "Networking", weight: 7, totalPoints: 7, hintCount: 0 },
  { id: "q03", instance: "instance-2", domain: "Networking", weight: 9, totalPoints: 9, hintCount: 0 },
];

function renderNav(selectedId: string, onSelect: (id: string) => void = () => {}) {
  return render(
    <QuestionPanel
      questions={bank}
      selectedId={selectedId}
      onSelect={onSelect}
      open
      onToggle={() => {}}
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
        open
        onToggle={() => {}}
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

  test("every question is reachable at once, grouped by domain", async () => {
    const grid = await openGrid("q01");
    for (const id of ["q01", "q02", "q03"]) {
      expect(grid.getByRole("button", { name: new RegExp(`^${id}`) })).toBeInTheDocument();
    }
    // The domain finally gets a full line here instead of being ellipsed
    // to about eight characters inside a 360px row.
    expect(grid.getByRole("heading", { name: "Networking" })).toBeInTheDocument();
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
        open
        onToggle={() => {}}
      />,
    );

    // A question fetch against a local facilitator lands in tens of
    // milliseconds; throwing the text away for that long flashes the pane
    // on every single step between questions.
    expect(screen.getByRole("button", { name: /aurora-staging/ })).toBeInTheDocument();
  });
});
