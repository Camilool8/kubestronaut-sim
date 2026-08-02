import { beforeEach, describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskVerdicts } from "./TaskVerdicts";
import { marksStore } from "./marksStore";
import type { QuestionResult } from "../api";

const task = (over: Partial<QuestionResult> & { id: string }): QuestionResult => ({
  instance: "instance-1",
  domain: "Services and Networking",
  earned: 0,
  total: 5,
  checks: [],
  ...over,
});

// One of each verdict, all three carrying the server's own value.
const graded: QuestionResult[] = [
  task({ id: "q01", title: "Namespaces", earned: 5, total: 5, verdict: "correct" }),
  task({ id: "q02", title: "Ingress", earned: 3, total: 7, verdict: "partial" }),
  task({ id: "q03", title: "NetworkPolicy", earned: 0, total: 6, verdict: "failed" }),
];

// By class, not by role: a row is a <details> and so is the solution
// disclosure nested inside it, so `getAllByRole("group")` counts both.
const rows = () => [...document.querySelectorAll(".tv-row")];

beforeEach(() => {
  // Both halves matter: reset() drops the in-memory sets and the scope,
  // and clearing the storage stops the NEXT setScope() reading the
  // previous test's flags straight back in under the same key.
  marksStore.reset();
  window.sessionStorage.clear();
});

describe("TaskVerdicts rows", () => {
  test("numbers rows by the candidate's own sequence, not the bank id", () => {
    render(<TaskVerdicts questions={graded} />);
    const first = screen.getByText("Namespaces").closest("summary");
    expect(within(first!).getByText("1")).toBeInTheDocument();
  });

  test("keeps the ssh-able id beside a bank title", () => {
    render(<TaskVerdicts questions={graded} />);
    const first = screen.getByText("Namespaces").closest("summary");
    expect(first).toHaveTextContent("q01");
  });

  // Hands-on rows fall back to the id when the bank ships no title; the
  // id IS the question directory, so it is never dropped.
  test("falls back to the id when there is no title", () => {
    render(<TaskVerdicts questions={[task({ id: "q07" })]} />);
    expect(screen.getByText("q07")).toBeInTheDocument();
  });

  // The row still expands now that screens/Explain.tsx exists, and the
  // reason changed with it: this table is a SCANNING surface — twenty
  // rows read against each other — and the deep dive is a reading surface
  // for one task. A candidate comparing why check 2 failed across three
  // tasks should not have to make three navigations and lose the table
  // each time. The link into the deep dive is the test below.
  test("a row opens its grader checks in place", async () => {
    const user = userEvent.setup();
    render(
      <TaskVerdicts
        questions={[
          task({
            id: "q01",
            title: "Namespaces",
            checks: [
              { name: "10_ns.sh", desc: "Namespace exists", points: 2, earned: 2, passed: true, message: "" },
            ],
          }),
        ]}
      />,
    );

    // A closed <details> keeps its content in the DOM, so `open` is the
    // state to assert on rather than the check's presence.
    const row = screen.getByText("Namespaces").closest("details");
    expect(row).not.toHaveAttribute("open");

    await user.click(screen.getByText("Namespaces"));

    expect(row).toHaveAttribute("open");
    expect(screen.getByText("Namespace exists")).toBeInTheDocument();
  });

  // The link lives INSIDE the disclosure, not on the row itself: a
  // <summary> is an interactive element, so an <a> in one is nested
  // interactive content — an axe violation and an ambiguous click target.
  test("an opened row links into that task's full explanation", () => {
    render(<TaskVerdicts questions={graded} />);

    const row = screen.getByText("Ingress").closest("details");
    const link = within(row!).getByRole("link", { name: /full explanation/i });
    expect(link).toHaveAttribute("href", "#/results/q02");
    // Outside the summary, which is what keeps the row's own toggle
    // unambiguous.
    expect(link.closest("summary")).toBeNull();
  });

  // Twenty rows produce twenty of these. Twenty links sharing one
  // accessible name is a list a screen-reader user cannot navigate, so
  // each is numbered by the position its row already shows.
  test("names each explanation link by the task it opens", () => {
    render(<TaskVerdicts questions={graded} />);
    const names = screen
      .getAllByRole("link", { name: /full explanation/i })
      .map((a) => a.textContent);
    expect(new Set(names).size).toBe(3);
    expect(names[0]).toMatch(/task 1/i);
    expect(names[2]).toMatch(/task 3/i);
  });
});

describe("TaskVerdicts verdicts", () => {
  test("prints the server's verdict for each row", () => {
    render(<TaskVerdicts questions={graded} />);
    expect(screen.getByText("CORRECT")).toBeInTheDocument();
    expect(screen.getByText("PARTIAL")).toBeInTheDocument();
    expect(screen.getByText("FAILED")).toBeInTheDocument();
  });

  // The upgrade path: a result graded before `verdict` existed carries
  // none, and the column must still be filled. The rule mirrors the
  // grader's own (evaluate.go:402) — including a question with no
  // scorable points reading as failed rather than as a free "correct".
  test("derives a missing verdict exactly as the grader does", () => {
    render(
      <TaskVerdicts
        questions={[
          task({ id: "q01", title: "All of it", earned: 5, total: 5 }),
          task({ id: "q02", title: "Some of it", earned: 2, total: 5 }),
          task({ id: "q03", title: "None of it", earned: 0, total: 5 }),
          task({ id: "q04", title: "Nothing to score", earned: 0, total: 0 }),
        ]}
      />,
    );

    const verdictOf = (title: string) =>
      screen.getByText(title).closest("summary")?.querySelector(".tv-verdict")?.textContent;
    expect(verdictOf("All of it")).toContain("CORRECT");
    expect(verdictOf("Some of it")).toContain("PARTIAL");
    expect(verdictOf("None of it")).toContain("FAILED");
    expect(verdictOf("Nothing to score")).toContain("FAILED");
  });
});

describe("TaskVerdicts columns", () => {
  // Both of these are absent on every result graded before they existed,
  // and a column of dashes costs width to say nothing.
  test("drops the weight and time columns when no row can fill them", () => {
    render(<TaskVerdicts questions={graded} />);
    expect(screen.queryByText("Weight")).toBeNull();
    expect(screen.queryByText("Time")).toBeNull();
    expect(screen.getByText("Verdict")).toBeInTheDocument();
  });

  test("shows them as soon as one row can", () => {
    render(
      <TaskVerdicts
        questions={[
          task({ id: "q01", title: "Ingress", weightPct: 7.4, timeSpentSeconds: 521 }),
          task({ id: "q02", title: "Quotas" }),
        ]}
      />,
    );

    expect(screen.getByText("Weight")).toBeInTheDocument();
    expect(screen.getByText("Time")).toBeInTheDocument();
    expect(screen.getByText("7%")).toBeInTheDocument();
    expect(screen.getByText(/8m 41s/)).toBeInTheDocument();
    // The row that has neither says so per-row, because there the
    // absence is about that task and not about the whole result.
    const bare = screen.getByText("Quotas").closest("summary");
    expect(within(bare!).getAllByText("—")).toHaveLength(2);
    expect(bare).toHaveTextContent("not recorded");
  });

  // The overshoot is printed, not only tinted: --warn-strong is the
  // second signal and "+2m 41s" is the first.
  test("prints how far over the pacing target a task ran", () => {
    render(
      <TaskVerdicts
        questions={[task({ id: "q01", title: "Ingress", timeSpentSeconds: 521, targetSeconds: 360 })]}
      />,
    );
    expect(screen.getByText("+2m 41s")).toBeInTheDocument();
    expect(screen.getByText(/2m 41s over the 6m target/)).toBeInTheDocument();
  });

  test("says nothing about pacing for a task inside its target", () => {
    render(
      <TaskVerdicts
        questions={[task({ id: "q01", title: "Ingress", timeSpentSeconds: 200, targetSeconds: 360 })]}
      />,
    );
    expect(screen.queryByText(/over the/)).toBeNull();
  });
});

describe("TaskVerdicts filters", () => {
  test("filters the rows down to one verdict", async () => {
    const user = userEvent.setup();
    render(<TaskVerdicts questions={graded} />);
    expect(rows()).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: /failed/i }));
    expect(rows()).toHaveLength(1);
    expect(screen.getByText("NetworkPolicy")).toBeInTheDocument();
    expect(screen.queryByText("Namespaces")).toBeNull();

    await user.click(screen.getByRole("button", { name: /all/i }));
    expect(rows()).toHaveLength(3);
  });

  // A chip reading "Failed 0" is a control whose only outcome is an empty
  // list, and this screen has enough to say without one.
  test("draws only the chips that would find something", () => {
    render(
      <TaskVerdicts
        questions={[task({ id: "q01", title: "Namespaces", earned: 5, total: 5 })]}
      />,
    );
    expect(screen.getByRole("button", { name: /all/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /failed/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /partial/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /flagged/i })).toBeNull();
  });

  test("offers the flagged filter only when the candidate flagged something", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<TaskVerdicts questions={graded} />);
    expect(screen.queryByRole("button", { name: /flagged/i })).toBeNull();
    unmount();

    marksStore.setScope("2026-08-01T10:00:00Z");
    marksStore.toggleMark("q02");
    render(<TaskVerdicts questions={graded} />);

    await user.click(screen.getByRole("button", { name: /flagged/i }));
    expect(rows()).toHaveLength(1);
    expect(screen.getByText("Ingress")).toBeInTheDocument();
  });

  // The flag is drawn, never typed: @fontsource declares a unicode-range
  // per @font-face and ⚑ is outside every one of them.
  test("marks a flagged row with the drawn glyph and a text equivalent", () => {
    marksStore.setScope("2026-08-01T10:00:00Z");
    marksStore.toggleMark("q02");
    render(<TaskVerdicts questions={graded} />);

    const flagged = screen.getByText("Ingress").closest("summary");
    expect(flagged).toHaveTextContent("Flagged");
    expect(flagged?.querySelector("svg.icon")).not.toBeNull();
    expect(flagged?.textContent).not.toContain("⚑");
  });
});
