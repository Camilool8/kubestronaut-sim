import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Navigator, type NavigatorQuestion } from "./Navigator";
import { marksStore } from "./marksStore";

const questions: NavigatorQuestion[] = Array.from({ length: 12 }, (_, i) => ({
  id: `q${String(i + 1).padStart(2, "0")}`,
  label: `Q${i + 1}`,
  detail: "Kubernetes Fundamentals",
  done: i < 3,
}));

afterEach(() => {
  marksStore.reset();
  window.sessionStorage.clear();
});

function renderNavigator(overrides: Partial<Parameters<typeof Navigator>[0]> = {}) {
  const onSelect = vi.fn();
  const onDismiss = vi.fn();
  const result = render(
    <Navigator
      id="question-jump"
      questions={questions}
      selectedId="q05"
      progress="answered"
      onSelect={onSelect}
      onDismiss={onDismiss}
      {...overrides}
    />,
  );
  return { ...result, onSelect, onDismiss };
}

function tile(name: string) {
  return screen.getByRole("button", { name: new RegExp(`^${name}\\b`) });
}

describe("Navigator tiles", () => {
  test("every question is one tile, and the current one says so", () => {
    renderNavigator();
    expect(screen.getAllByRole("button", { name: /^Q\d/ })).toHaveLength(12);

    expect(tile("Q5")).toHaveAttribute("aria-current", "true");
    expect(tile("Q4")).not.toHaveAttribute("aria-current");
  });

  test("the grid opens with the focus on the question you are on", () => {
    renderNavigator();
    expect(tile("Q5")).toHaveFocus();
  });

  test("one tile is Tab-reachable, and the arrows move between the rest", async () => {
    renderNavigator();

    expect(tile("Q5")).toHaveAttribute("tabindex", "0");
    expect(tile("Q6")).toHaveAttribute("tabindex", "-1");

    await userEvent.keyboard("{ArrowRight}");
    expect(tile("Q6")).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(tile("Q4")).toHaveFocus();

    await userEvent.keyboard("{Home}");
    expect(tile("Q1")).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(tile("Q12")).toHaveFocus();
  });

  test("the arrows stop at the ends instead of wrapping", async () => {
    renderNavigator({ selectedId: "q01" });
    await userEvent.keyboard("{ArrowLeft}");

    expect(tile("Q1")).toHaveFocus();
  });

  test("down and up move a row, not a tile", async () => {
    renderNavigator({ selectedId: "q01" });

    await userEvent.keyboard("{ArrowDown}");
    expect(tile("Q11")).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(tile("Q1")).toHaveFocus();
  });

  test("a digit jumps, and a second digit extends it", async () => {
    renderNavigator({ selectedId: "q01" });
    await userEvent.keyboard("7");
    expect(tile("Q7")).toHaveFocus();

    await userEvent.keyboard("12");
    expect(tile("Q12")).toHaveFocus();
  });

  test("picking a tile hands the bank id back, not what the tile printed", async () => {
    const { onSelect } = renderNavigator();
    await userEvent.click(tile("Q7"));

    expect(onSelect).toHaveBeenCalledWith("q07");
  });

  test("what the tile has no room to draw is still said", () => {
    renderNavigator();
    expect(tile("Q1")).toHaveAccessibleName(/Kubernetes Fundamentals/);
    expect(tile("Q1")).toHaveAccessibleName(/answered/);
    expect(tile("Q12")).toHaveAccessibleName(/unanswered/);
  });

  test("the hands-on vocabulary never claims an answer", () => {
    renderNavigator({ progress: "opened" });

    expect(tile("Q1")).toHaveAccessibleName(/opened/);
    expect(tile("Q12")).toHaveAccessibleName(/not opened/);
    expect(screen.queryByText("Answered")).toBeNull();
    expect(screen.getByText("Opened")).toBeInTheDocument();
  });
});

describe("Navigator filters", () => {
  test("the chips count what they filter to", () => {
    renderNavigator();
    const group = within(screen.getByRole("group"));
    expect(group.getByRole("button", { name: /^All/ })).toHaveTextContent("12");
    expect(group.getByRole("button", { name: /Unanswered/ })).toHaveTextContent("9");
  });

  test("filtering to unanswered drops the answered tiles", async () => {
    renderNavigator();
    await userEvent.click(screen.getByRole("button", { name: /Unanswered/ }));
    expect(screen.queryByRole("button", { name: /^Q1\b/ })).toBeNull();
    expect(tile("Q4")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Q\d/ })).toHaveLength(9);
  });

  test("a filter that matches nothing says why instead of going blank", async () => {
    marksStore.setScope("2026-08-01T10:00:00Z");
    renderNavigator();
    await userEvent.click(screen.getByRole("button", { name: /Flagged/ }));
    expect(screen.getByText(/Nothing is flagged/)).toBeInTheDocument();
  });
});

describe("Navigator flags", () => {
  test("F flags the tile you are on, and F again clears it", async () => {
    marksStore.setScope("2026-08-01T10:00:00Z");
    renderNavigator();

    await userEvent.keyboard("f");
    expect(marksStore.isMarked("q05")).toBe(true);
    expect(tile("Q5")).toHaveAccessibleName(/flagged for review/);

    await userEvent.keyboard("f");
    expect(marksStore.isMarked("q05")).toBe(false);
  });

  test("unflagging under the flagged filter moves the focus, not loses it", async () => {
    marksStore.setScope("2026-08-01T10:00:00Z");
    marksStore.toggleMark("q05");
    marksStore.toggleMark("q06");
    renderNavigator();

    await userEvent.click(screen.getByRole("button", { name: /Flagged/ }));
    tile("Q5").focus();
    await userEvent.keyboard("f");

    expect(screen.queryByRole("button", { name: /^Q5\b/ })).toBeNull();
    expect(tile("Q6")).toHaveFocus();
  });

  test("the flagged filter empties as the last flag is cleared", async () => {
    marksStore.setScope("2026-08-01T10:00:00Z");
    marksStore.toggleMark("q05");
    renderNavigator();

    await userEvent.click(screen.getByRole("button", { name: /Flagged/ }));
    expect(screen.getAllByRole("button", { name: /^Q\d/ })).toHaveLength(1);

    tile("Q5").focus();
    await userEvent.keyboard("f");
    expect(screen.getByText(/Nothing is flagged/)).toBeInTheDocument();
  });
});

describe("Navigator dismissal", () => {
  test("Escape closes it without ending the exam", async () => {
    const { onDismiss } = renderNavigator();
    await userEvent.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalled();
  });

  test("it is a disclosure, not a dialog", () => {
    const { container } = renderNavigator();

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
