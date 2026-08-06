import { describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DomainBreakdown } from "./DomainBreakdown";
import type { DomainResult, QuestionResult } from "../api";

const q = (id: string, domain: string, earned: number, total: number): QuestionResult => ({
  id,
  instance: "instance-1",
  domain,
  earned,
  total,
  checks: [],
});

const rows = () => screen.getAllByRole("listitem");

describe("DomainBreakdown", () => {
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

    const networking = rows().find((r) => r.textContent?.includes("Services and Networking"));
    expect(networking).toBeDefined();
    expect(within(networking!).getByText("25%")).toBeInTheDocument();
    expect(networking).toHaveTextContent("2 of 3 tasks · 5/20 pts");

    const deployment = rows().find((r) => r.textContent?.includes("Application Deployment"));
    expect(within(deployment!).getByText("90%")).toBeInTheDocument();
  });

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

    expect(rows().map((r) => r.querySelector(".domain-name")?.textContent)).toEqual([
      "Zebra",
      "Middle",
      "Aardvark",
    ]);
  });

  test("renders nothing rather than an empty list", () => {
    const { container } = render(<DomainBreakdown questions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("keeps unclassified questions visible", () => {
    render(<DomainBreakdown questions={[q("q01", "", 3, 10)]} />);
    expect(screen.getByText("Unclassified")).toBeInTheDocument();
  });
});

describe("DomainBreakdown weighting", () => {
  const rollup: DomainResult[] = [
    {
      domain: "Services and Networking",
      earned: 5,
      total: 20,
      weightPct: 20.4,
      questionCount: 2,
    },
    {
      domain: "Application Deployment",
      earned: 9,
      total: 10,
      weightPct: 79.6,
      questionCount: 1,
    },
  ];

  test("prefers the server's rollup and prints its curriculum weight", () => {
    render(
      <DomainBreakdown
        questions={[
          q("q01", "Services and Networking", 4, 10),
          q("q02", "Services and Networking", 1, 10),
          q("q03", "Application Deployment", 9, 10),
        ]}
        domains={rollup}
      />,
    );

    const networking = rows().find((r) => r.textContent?.includes("Services and Networking"));
    expect(networking).toHaveTextContent("20% of exam · 2 of 3 tasks · 5/20 pts");
    expect(screen.getByText(/weighted to the published curriculum/i)).toBeInTheDocument();
  });

  test("falls back to the client rollup when the result carries no domains", () => {
    render(
      <DomainBreakdown
        questions={[
          q("q01", "Services and Networking", 4, 10),
          q("q02", "Application Deployment", 9, 10),
        ]}
      />,
    );

    expect(screen.getByText(/weakest first, by points/i)).toBeInTheDocument();
    expect(screen.queryByText(/weighted to the published curriculum/i)).toBeNull();
    expect(screen.queryByText(/of exam/)).toBeNull();
  });

  test("an empty rollup is treated as no rollup", () => {
    render(
      <DomainBreakdown
        questions={[q("q01", "Services and Networking", 4, 10)]}
        domains={[]}
      />,
    );
    expect(screen.getByText("Services and Networking")).toBeInTheDocument();
  });

  test("names a domain under the threshold in words, not only in colour", () => {
    render(
      <DomainBreakdown
        questions={[
          q("q01", "Services and Networking", 4, 10),
          q("q02", "Application Deployment", 9, 10),
        ]}
        passingScore={66}
      />,
    );

    const weak = rows().find((r) => r.textContent?.includes("Services and Networking"));
    const strong = rows().find((r) => r.textContent?.includes("Application Deployment"));
    expect(weak).toHaveTextContent("below threshold");
    expect(strong).not.toHaveTextContent("below threshold");
  });

  test("marks nothing when no threshold was given", () => {
    render(<DomainBreakdown questions={[q("q01", "Services and Networking", 0, 10)]} />);
    expect(screen.queryByText("below threshold")).toBeNull();
  });
});
