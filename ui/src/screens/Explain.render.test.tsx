import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Explain } from "./Explain";
import { diffDocuments } from "../lib/explainDiff";
import type { CheckResult, QuestionResult, Results } from "../api";
import { strings } from "../strings";

// The real LCS runs; only its call count is observed. diffDocuments allocates
// an Int32Array of (actual+1)·(expected+1) entries, so every extra call is a
// full O(n·m) pass and a fresh multi-megabyte buffer at the MAX_LINES cap.
vi.mock("../lib/explainDiff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/explainDiff")>();
  return { ...actual, diffDocuments: vi.fn(actual.diffDocuments) };
});

const diffSpy = vi.mocked(diffDocuments);

const check = (over: Partial<CheckResult> & { name: string }): CheckResult => ({
  desc: "Service selects the Deployment's pods",
  points: 2,
  earned: 0,
  passed: false,
  message: "selector is 'app=inventory-api', want app=inventory",
  ...over,
});

const task = (over: Partial<QuestionResult> & { id: string }): QuestionResult => ({
  instance: "instance-1",
  domain: "Services and Networking",
  earned: 0,
  total: 5,
  checks: [],
  ...over,
});

const attempt = (questions: QuestionResult[]): Results => ({
  bank: "ckad-mock-01",
  gradedAt: "2026-08-01T09:00:00Z",
  earned: 0,
  total: 0,
  percent: 0,
  passingScore: 66,
  passed: false,
  questions,
});

const ACTUAL =
  "metadata:\n  name: inventory\nspec:\n  ports:\n    - port: 80\n      targetPort: 80\n  selector:\n    app: inventory-api\n";
const EXPECTED =
  "metadata:\n  name: inventory\nspec:\n  ports:\n    - port: 80\n      targetPort: 8080\n  selector:\n    app: inventory\n";

const comparison = (name: string, actual: string, expected: string) =>
  check({
    name,
    artifacts: [
      { kind: "actual", lang: "yaml", body: actual },
      { kind: "expected", lang: "yaml", body: expected },
    ],
  });

const twoBlocks = attempt([
  task({
    id: "q19",
    title: "Expose the inventory Deployment",
    checks: [
      comparison("10_service.sh", ACTUAL, EXPECTED),
      comparison("20_reachable.sh", "items: []\n", "items:\n  - name: web\n"),
    ],
  }),
]);

function stubSolution() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/solution"))
        return new Response(
          JSON.stringify({ id: "q19", markdown: "Apply the Service with `kubectl`." }),
          { status: 200 },
        );
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );
}

const panes = () => [...document.querySelectorAll(".explain-pane")];

beforeEach(() => {
  diffSpy.mockClear();
  stubSolution();
});

afterEach(() => vi.unstubAllGlobals());

describe("Explain evidence diffing", () => {
  test("each comparison is diffed once, however many times the screen renders", async () => {
    render(<Explain results={twoBlocks} questionId="q19" />);

    // The solution arrives asynchronously and re-renders the whole screen, so
    // by this point Explain has rendered at least twice.
    expect(await screen.findByText(/Apply the Service with/)).toBeInTheDocument();
    expect(panes()).toHaveLength(4);

    expect(diffSpy).toHaveBeenCalledTimes(2);
  });

  test("a solution that fails to load does not buy extra diff passes either", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("/solution")
          ? new Response(JSON.stringify({ error: "session has not ended" }), { status: 403 })
          : new Response(JSON.stringify({}), { status: 200 }),
      ),
    );

    render(<Explain results={twoBlocks} questionId="q19" />);

    expect(await screen.findByText(/session has not ended/)).toBeInTheDocument();
    expect(diffSpy).toHaveBeenCalledTimes(2);
  });

  test("evidence that arrives with a later grading result is diffed and drawn", async () => {
    const bare = attempt([task({ id: "q19", checks: [check({ name: "10_service.sh" })] })]);

    const { rerender } = render(<Explain results={bare} questionId="q19" />);
    expect(await screen.findByText(/Apply the Service with/)).toBeInTheDocument();
    expect(panes()).toHaveLength(0);
    expect(diffSpy).toHaveBeenCalledTimes(0);

    rerender(<Explain results={twoBlocks} questionId="q19" />);

    expect(panes()).toHaveLength(4);
    expect(diffSpy).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll(".explain-line.is-added").length).toBeGreaterThan(0);
  });

  test("a re-grade that changes what the cluster held is diffed again", async () => {
    const first = attempt([
      task({ id: "q19", checks: [comparison("10_service.sh", ACTUAL, EXPECTED)] }),
    ]);
    const second = attempt([
      task({ id: "q19", checks: [comparison("10_service.sh", EXPECTED, EXPECTED)] }),
    ]);

    const { rerender } = render(<Explain results={first} questionId="q19" />);
    expect(await screen.findByText(/Apply the Service with/)).toBeInTheDocument();
    expect(document.querySelectorAll(".explain-line.is-added").length).toBeGreaterThan(0);
    expect(diffSpy).toHaveBeenCalledTimes(1);

    rerender(<Explain results={second} questionId="q19" />);

    expect(diffSpy).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll(".explain-line.is-added")).toHaveLength(0);
    expect(screen.getByText(strings.explain.diffIdentical)).toBeInTheDocument();
  });
});
