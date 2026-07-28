import { describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DomainBreakdown } from "./DomainBreakdown";
import type { QuestionResult } from "../api";

const q = (id: string, domain: string, earned: number, total: number): QuestionResult => ({
  id,
  instance: "instance-1",
  domain,
  earned,
  total,
  checks: [],
});

describe("DomainBreakdown", () => {
  // Several questions per domain is the normal case; a per-question list
  // would not answer "which domain am I weak in".
  test("aggregates questions into their domains", () => {
    render(
      <DomainBreakdown
        questions={[
          q("q01", "Services and Networking", 4, 10),
          q("q02", "Services and Networking", 1, 10),
          q("q03", "Application Deployment", 9, 10),
        ]}
      />,
    );

    const networking = screen.getByRole("row", { name: /Services and Networking/ });
    expect(within(networking).getByText("25% (5/20)")).toBeInTheDocument();

    const deployment = screen.getByRole("row", { name: /Application Deployment/ });
    expect(within(deployment).getByText("90% (9/10)")).toBeInTheDocument();
  });

  // Worst first, because alphabetical would bury the one row that should
  // change what the candidate does next.
  test("orders weakest domain first", () => {
    render(
      <DomainBreakdown
        questions={[
          q("q01", "Aardvark", 10, 10),
          q("q02", "Zebra", 0, 10),
          q("q03", "Middle", 5, 10),
        ]}
      />,
    );

    const rows = screen.getAllByRole("row").slice(1); // drop the header
    expect(rows.map((r) => within(r).getAllByRole("rowheader")[0].textContent)).toEqual([
      "Zebra",
      "Middle",
      "Aardvark",
    ]);
  });

  test("renders nothing rather than an empty table", () => {
    const { container } = render(<DomainBreakdown questions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  // A question with no domain must not vanish from the totals.
  test("keeps unclassified questions visible", () => {
    render(<DomainBreakdown questions={[q("q01", "", 3, 10)]} />);
    expect(screen.getByText("Unclassified")).toBeInTheDocument();
  });
});
