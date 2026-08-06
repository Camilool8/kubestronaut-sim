import { beforeEach, describe, expect, test, vi } from "vitest";
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

const graded: QuestionResult[] = [
  task({ id: "q01", title: "Namespaces", earned: 5, total: 5, verdict: "correct" }),
  task({ id: "q02", title: "Ingress", earned: 3, total: 7, verdict: "partial" }),
  task({ id: "q03", title: "NetworkPolicy", earned: 0, total: 6, verdict: "failed" }),
];

const rows = () => [...document.querySelectorAll(".tv-row")];

beforeEach(() => {
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

  test("carries the id and the domain on the task's meta line, in full", () => {
    render(
      <TaskVerdicts
        questions={[
          task({
            id: "q06",
            title: "ConfigMaps, as env and as a volume",
            domain: "Application Environment, Configuration and Security",
          }),
        ]}
      />,
    );

    const meta = document.querySelector(".tv-task-meta");
    expect(meta).not.toBeNull();
    expect(meta).toHaveTextContent("q06");

    expect(meta).toHaveTextContent("Application Environment, Configuration and Security");

    expect(meta?.closest(".tv-task")).not.toBeNull();
    expect(screen.queryByText("Domain")).toBeNull();
  });

  test("falls back to the id when there is no title", () => {
    render(<TaskVerdicts questions={[task({ id: "q07" })]} />);
    expect(screen.getByText("q07")).toBeInTheDocument();
  });

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

    const row = screen.getByText("Namespaces").closest("details");
    expect(row).not.toHaveAttribute("open");

    await user.click(screen.getByText("Namespaces"));

    expect(row).toHaveAttribute("open");
    expect(screen.getByText("Namespace exists")).toBeInTheDocument();
  });

  test("a row offers no solution of its own, and asks for none", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(<TaskVerdicts questions={graded} />);
    await user.click(screen.getByText("Namespaces"));

    expect(screen.getByText("Namespaces").closest("details")).toHaveAttribute("open");
    expect(screen.queryByText(/show solution/i)).toBeNull();
    expect(document.querySelector(".solution-details")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  test("an opened row links into that task's full explanation", () => {
    render(<TaskVerdicts questions={graded} />);

    const row = screen.getByText("Ingress").closest("details");
    const link = within(row!).getByRole("link", { name: /full explanation/i });
    expect(link).toHaveAttribute("href", "#/results/q02");

    expect(link.closest("summary")).toBeNull();
  });

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

    const bare = screen.getByText("Quotas").closest("summary");
    expect(within(bare!).getAllByText("—")).toHaveLength(2);
    expect(bare).toHaveTextContent("not recorded");
  });

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
