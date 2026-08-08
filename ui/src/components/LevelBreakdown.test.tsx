import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { LevelBreakdown } from "./LevelBreakdown";
import type { LevelResult } from "../api";

const level = (l: string, earned: number, total: number, n = 1): LevelResult => ({
  level: l,
  earned,
  total,
  questionCount: n,
});

describe("level breakdown", () => {
  test("renders nothing for a bank that declares no levels", () => {
    const { container } = render(<LevelBreakdown levels={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders nothing when only one level was drawn — there is no shape to read", () => {
    const { container } = render(<LevelBreakdown levels={[level("core", 4, 8, 2)]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("keeps the rows in tier order even when the shortest tasks scored worst", () => {
    render(
      <LevelBreakdown
        levels={[level("quick", 0, 10, 2), level("core", 5, 10, 2), level("deep", 10, 10, 2)]}
      />,
    );
    const names = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(names[0]).toMatch(/Quick/);
    expect(names[1]).toMatch(/Core/);
    expect(names[2]).toMatch(/Deep/);
  });

  test("names pacing when the score falls away as the tasks get longer", () => {
    render(<LevelBreakdown levels={[level("quick", 10, 10, 2), level("deep", 3, 10, 2)]} />);
    expect(screen.getByText(/falls away as the tasks get longer/)).toBeInTheDocument();
    expect(screen.queryByText(/holds up across short and long tasks/)).not.toBeInTheDocument();
  });

  test("says length is not the problem when the score holds across levels", () => {
    render(<LevelBreakdown levels={[level("quick", 5, 10, 2), level("deep", 5, 10, 2)]} />);
    expect(screen.getByText(/holds up across short and long tasks/)).toBeInTheDocument();
    expect(screen.queryByText(/falls away as the tasks get longer/)).not.toBeInTheDocument();
  });

  test("shows each level's percent and its task and point counts", () => {
    render(<LevelBreakdown levels={[level("quick", 9, 10, 3), level("deep", 2, 10, 2)]} />);
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText(/3 tasks · 9\/10 pts/)).toBeInTheDocument();
    expect(screen.getByText(/2 tasks · 2\/10 pts/)).toBeInTheDocument();
  });

  test("ignores a level that carries no points rather than dividing by zero", () => {
    render(<LevelBreakdown levels={[level("quick", 5, 10, 2), level("core", 0, 0, 0), level("deep", 5, 10, 2)]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
