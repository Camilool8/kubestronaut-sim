import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Explain } from "./Explain";
import type { CheckResult, QuestionResult, Results } from "../api";
import { strings } from "../strings";

const AXE_OPTS = { rules: { region: { enabled: false } } } as const;

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

const withEvidence = task({
  id: "q19",
  title: "Expose the inventory Deployment",
  earned: 3,
  total: 7,
  verdict: "partial",
  weightPct: 7.4,
  timeSpentSeconds: 521,
  targetSeconds: 360,
  checks: [
    check({
      name: "10_service.sh",
      artifacts: [
        { kind: "actual", lang: "yaml", body: ACTUAL },
        { kind: "expected", lang: "yaml", body: EXPECTED },
        { kind: "why", body: "The selector matches no Pod, so the Service has no endpoints." },
      ],
    }),
  ],
});

function stubSolution(body: unknown = { id: "q19", markdown: "Apply the Service with `kubectl`." }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/solution")) return new Response(JSON.stringify(body), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );
}

const panes = () => [...document.querySelectorAll(".explain-pane")];
const marked = (kind: "is-removed" | "is-added") => [
  ...document.querySelectorAll(`.explain-line.${kind}`),
];

beforeEach(() => stubSolution());
afterEach(() => vi.unstubAllGlobals());

describe("Explain header", () => {
  test("names the task by its position, domain and weight, and titles the screen with it", () => {
    render(<Explain results={attempt([withEvidence])} questionId="q19" />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Expose the inventory Deployment");

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    const eyebrow = document.querySelector(".explain-eyebrow");
    expect(eyebrow).toHaveTextContent("Task 1");
    expect(eyebrow).toHaveTextContent("Services and Networking");
    expect(eyebrow).toHaveTextContent("weight 7%");
  });

  test("pads the task number to the width of the attempt", () => {
    const many = Array.from({ length: 12 }, (_, i) => task({ id: `q${i}` }));
    render(<Explain results={attempt(many)} questionId="q2" />);
    expect(document.querySelector(".explain-eyebrow")).toHaveTextContent("Task 03");
  });

  test("carries the verdict and the points it was measured from", () => {
    render(<Explain results={attempt([withEvidence])} questionId="q19" />);
    const pill = document.querySelector(".explain-verdict");
    expect(pill).toHaveTextContent("PARTIAL");
    expect(pill).toHaveTextContent("3/7");

    expect(pill).toHaveTextContent("Points:");
  });

  test("reports how long the task was open, against its pacing budget", () => {
    render(<Explain results={attempt([withEvidence])} questionId="q19" />);
    const timing = document.querySelector(".explain-timing");
    expect(timing).toHaveTextContent("8m 41s");
    expect(timing).toHaveTextContent("target 6m");
    expect(timing?.textContent).not.toMatch(/spent|worked/i);
  });

  test("drops the timing pill for a result graded before per-task timing existed", () => {
    render(<Explain results={attempt([task({ id: "q01" })])} questionId="q01" />);
    expect(document.querySelector(".explain-timing")).toBeNull();
  });

  test("falls back to the ssh-able id when the bank ships no title", () => {
    render(<Explain results={attempt([task({ id: "q07" })])} questionId="q07" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("q07");
  });
});

describe("Explain document panes", () => {
  test("shows what the cluster had beside what was expected", () => {
    render(<Explain results={attempt([withEvidence])} questionId="q19" />);

    expect(panes()).toHaveLength(2);
    expect(panes()[0]).toHaveTextContent(strings.explain.actualTitle);
    expect(panes()[1]).toHaveTextContent(strings.explain.expectedTitle);

    expect(panes()[0]).toHaveTextContent("name: inventory");
    expect(panes()[1]).toHaveTextContent("name: inventory");
  });

  test("marks a changed line with something other than colour", () => {
    render(<Explain results={attempt([withEvidence])} questionId="q19" />);

    expect(marked("is-removed")).toHaveLength(2);
    expect(marked("is-added")).toHaveLength(2);

    expect(marked("is-removed")[1]).toHaveTextContent("inventory-api");
    expect(marked("is-removed")[0].textContent).toContain("-");
    expect(marked("is-added")[0]).toHaveTextContent("8080");
    expect(marked("is-added")[0].textContent).toContain("+");
    expect(marked("is-removed")[0]).toHaveTextContent(strings.explain.lineChanged);
  });

  test("names the glyphs, so the marks do not assume diff literacy", () => {
    render(<Explain results={attempt([withEvidence])} questionId="q19" />);
    expect(screen.getByText(strings.explain.diffLegend)).toBeInTheDocument();
  });

  test("leaves the lines the two documents share unmarked", () => {
    render(<Explain results={attempt([withEvidence])} questionId="q19" />);
    const unmarked = [...document.querySelectorAll(".explain-line")].filter(
      (l) => !l.classList.contains("is-removed") && !l.classList.contains("is-added"),
    );
    expect(unmarked.map((l) => l.textContent?.trim())).toContain("metadata:");
  });

  test("says so when the two documents match line for line", () => {
    render(
      <Explain
        results={attempt([
          task({
            id: "q19",
            checks: [
              check({
                name: "10_service.sh",
                artifacts: [
                  { kind: "actual", body: ACTUAL },
                  { kind: "expected", body: ACTUAL },
                ],
              }),
            ],
          }),
        ])}
        questionId="q19"
      />,
    );
    expect(screen.getByText(strings.explain.diffIdentical)).toBeInTheDocument();
    expect(screen.queryByText(strings.explain.diffLegend)).toBeNull();
  });

  test("a capture with no counterpart renders alone, and says what to compare it against", () => {
    render(
      <Explain
        results={attempt([
          task({
            id: "q19",
            checks: [
              check({
                name: "20_reachable.sh",
                artifacts: [{ kind: "actual", lang: "yaml", body: ACTUAL }],
              }),
            ],
          }),
        ])}
        questionId="q19"
      />,
    );

    expect(panes()).toHaveLength(1);
    expect(panes()[0]).toHaveTextContent(strings.explain.actualTitle);
    expect(screen.getByText(strings.explain.actualOnlyNote)).toBeInTheDocument();

    expect(marked("is-removed")).toHaveLength(0);
    expect(screen.queryByText(strings.explain.diffLegend)).toBeNull();
  });

  const twoCapturingChecks = attempt([
    task({
      id: "q19",
      checks: [
        check({
          name: "10_service.sh",
          desc: "Service selects the Deployment's pods",
          artifacts: [
            { kind: "actual", body: ACTUAL },
            { kind: "expected", body: EXPECTED },
          ],
        }),
        check({
          name: "20_reachable.sh",
          desc: "Service has ready endpoints",
          artifacts: [
            { kind: "actual", body: "items: []\n" },
            { kind: "expected", body: "items:\n  - name: web\n" },
          ],
        }),
      ],
    }),
  ]);

  test("groups the panes under the check that captured them", () => {
    render(<Explain results={twoCapturingChecks} questionId="q19" />);

    const blocks = [...document.querySelectorAll(".explain-check")];
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveTextContent("Service selects the Deployment's pods");
    expect(blocks[1]).toHaveTextContent("Service has ready endpoints");
    expect(within(blocks[1] as HTMLElement).getByText(/items: \[\]/)).toBeInTheDocument();
  });

  test("heads the whole group once instead of every block", () => {
    render(<Explain results={twoCapturingChecks} questionId="q19" />);

    expect(document.querySelectorAll(".explain-evidence")).toHaveLength(1);
    expect(screen.getByText(strings.explain.evidenceTitle(2))).toBeInTheDocument();
    expect(strings.explain.evidenceTitle(2)).not.toBe(strings.explain.evidenceTitle(1));
  });

  test("names the glyphs once for the section, however many comparisons it holds", () => {
    render(<Explain results={twoCapturingChecks} questionId="q19" />);

    expect(screen.getByText(strings.explain.diffLegend)).toBeInTheDocument();
    expect(marked("is-removed").length).toBeGreaterThan(1);
  });

  test("keeps a per-comparison note on the comparison it describes", () => {
    render(
      <Explain
        results={attempt([
          task({
            id: "q19",
            checks: [
              check({
                name: "10_service.sh",
                artifacts: [
                  { kind: "actual", body: ACTUAL },
                  { kind: "expected", body: EXPECTED },
                ],
              }),
              check({ name: "20_reachable.sh", artifacts: [{ kind: "actual", body: ACTUAL }] }),
            ],
          }),
        ])}
        questionId="q19"
      />,
    );

    const blocks = [...document.querySelectorAll(".explain-check")];
    expect(
      within(blocks[1] as HTMLElement).getByText(strings.explain.actualOnlyNote),
    ).toBeInTheDocument();
    expect(within(blocks[0] as HTMLElement).queryByText(strings.explain.actualOnlyNote)).toBeNull();
  });

  test("renders the check's own prose about why it failed", () => {
    render(<Explain results={attempt([withEvidence])} questionId="q19" />);
    expect(screen.getByText(strings.explain.whyTitle)).toBeInTheDocument();
    expect(screen.getByText(/the Service has no endpoints/)).toBeInTheDocument();
  });
});

describe("Explain without evidence", () => {
  test("a task whose checks captured nothing is a complete screen, not an empty one", () => {
    render(
      <Explain
        results={attempt([
          task({
            id: "q01",
            title: "Namespaces & quotas",
            earned: 2,
            checks: [check({ name: "20_quota.sh", desc: "Quota applied", message: "quota missing" })],
          }),
        ])}
        questionId="q01"
      />,
    );

    expect(panes()).toHaveLength(0);
    expect(screen.getByText(strings.explain.noEvidenceTitle)).toBeInTheDocument();

    expect(screen.getByText("Quota applied")).toBeInTheDocument();
    expect(screen.getByText("quota missing")).toBeInTheDocument();
    expect(screen.getByText(strings.explain.solutionTitle)).toBeInTheDocument();
  });

  test("a task that scored full marks says there is nothing to explain", () => {
    render(
      <Explain
        results={attempt([
          task({
            id: "q01",
            title: "Namespaces",
            earned: 5,
            total: 5,
            verdict: "correct",
            checks: [check({ name: "10_ns.sh", desc: "Namespace exists", earned: 5, passed: true })],
          }),
        ])}
        questionId="q01"
      />,
    );

    expect(screen.getByText(strings.explain.correctTitle)).toBeInTheDocument();
    expect(screen.queryByText(strings.explain.noEvidenceTitle)).toBeNull();

    expect(screen.getByText(strings.explain.solutionTitle)).toBeInTheDocument();
  });

  test("a task the grader recorded no checks for says so", () => {
    render(<Explain results={attempt([task({ id: "q01" })])} questionId="q01" />);
    expect(screen.getByText(strings.explain.checksNone)).toBeInTheDocument();
  });
});

describe("Explain navigation", () => {
  const three = attempt([
    task({ id: "q01", title: "One" }),
    task({ id: "q02", title: "Two" }),
    task({ id: "q03", title: "Three" }),
  ]);

  test("steps to either neighbour from the middle of the attempt", () => {
    render(<Explain results={three} questionId="q02" />);
    expect(screen.getByRole("link", { name: /previous task/i })).toHaveAttribute(
      "href",
      "#/results/q01",
    );
    expect(screen.getByRole("link", { name: /next task/i })).toHaveAttribute(
      "href",
      "#/results/q03",
    );
  });

  test("labels the steps by position in the attempt", () => {
    render(<Explain results={three} questionId="q02" />);
    expect(screen.getByRole("link", { name: /previous task/i })).toHaveTextContent("Task 1");
    expect(screen.getByRole("link", { name: /next task/i })).toHaveTextContent("Task 3");
  });

  test("draws no previous step at the first task", () => {
    render(<Explain results={three} questionId="q01" />);
    expect(screen.queryByRole("link", { name: /previous task/i })).toBeNull();
    expect(screen.getByRole("link", { name: /next task/i })).toBeInTheDocument();
  });

  test("draws no next step at the last task", () => {
    render(<Explain results={three} questionId="q03" />);
    expect(screen.getByRole("link", { name: /previous task/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /next task/i })).toBeNull();
  });

  test("a single-task attempt gets no stepper at all", () => {
    render(<Explain results={attempt([task({ id: "q01" })])} questionId="q01" />);
    expect(document.querySelector(".explain-nav")).toBeNull();
  });

  test("always offers the way back to the table", () => {
    render(<Explain results={three} questionId="q02" />);
    expect(
      screen.getByRole("link", { name: strings.explain.backToResults }),
    ).toHaveAttribute("href", "#/results");
  });
});

describe("Explain unknown task", () => {
  test("says the task is not part of this attempt, and keeps the way back", () => {
    render(<Explain results={attempt([task({ id: "q01" })])} questionId="q99" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      strings.explain.unknownTask,
    );
    expect(
      screen.getByRole("link", { name: strings.explain.backToResults }),
    ).toBeInTheDocument();
  });
});

describe("Explain reference solution", () => {
  test("loads the reference solution without being asked", async () => {
    render(<Explain results={attempt([withEvidence])} questionId="q19" />);
    expect(await screen.findByText(/Apply the Service with/)).toBeInTheDocument();
  });

  test("reports a solution the facilitator refuses instead of waiting forever", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/solution"))
          return new Response(JSON.stringify({ error: "session has not ended" }), { status: 403 });
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(<Explain results={attempt([withEvidence])} questionId="q19" />);
    expect(await screen.findByText(/session has not ended/)).toBeInTheDocument();
    expect(screen.getByText(/couldn't load the reference solution/i)).toBeInTheDocument();
  });
});

describe("Explain upstream documentation", () => {
  const DOC_URL = "https://kubernetes.io/docs/concepts/services-networking/service/";

  test("links out to what the bank attached, and says where each one goes", async () => {
    stubSolution({
      id: "q19",
      markdown: "Apply the Service with `kubectl`.",
      docs: [{ label: "Services, Load Balancing, and Networking", url: DOC_URL }],
    });
    render(<Explain results={attempt([withEvidence])} questionId="q19" />);

    const link = await screen.findByRole("link", { name: /Load Balancing/ });
    expect(link).toHaveAttribute("href", DOC_URL);

    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(link.getAttribute("rel")).toContain("noopener");

    expect(document.querySelector(".explain-doc-host")).toHaveTextContent("kubernetes.io");
    expect(link).toHaveTextContent(strings.explain.docsNewTab);
  });

  test("a question with no upstream links simply ends after the solution", async () => {
    render(<Explain results={attempt([withEvidence])} questionId="q19" />);

    expect(await screen.findByText(/Apply the Service with/)).toBeInTheDocument();
    expect(document.querySelector(".explain-docs")).toBeNull();
    expect(screen.queryByText(strings.explain.docsTitle)).toBeNull();
  });

  test("an empty list reads the same as a missing one", async () => {
    stubSolution({ id: "q19", markdown: "Apply the Service.", docs: [] });
    render(<Explain results={attempt([withEvidence])} questionId="q19" />);

    expect(await screen.findByText(/Apply the Service/)).toBeInTheDocument();
    expect(document.querySelector(".explain-docs")).toBeNull();
  });

  test("drops a link the browser should not follow rather than rendering it", async () => {
    stubSolution({
      id: "q19",
      markdown: "Apply the Service.",
      docs: [
        { label: "Relative", url: "/docs/concepts" },
        { label: "Script", url: `java${"script"}:alert(1)` },
        { label: "Pod lifecycle", url: DOC_URL },
      ],
    });
    render(<Explain results={attempt([withEvidence])} questionId="q19" />);

    expect(await screen.findByText(/Apply the Service/)).toBeInTheDocument();
    expect(document.querySelectorAll(".explain-doc")).toHaveLength(1);
    expect(screen.queryByText("Script")).toBeNull();
    expect(screen.queryByText("Relative")).toBeNull();
  });
});

describe("Explain accessibility", () => {
  test("the deep dive with both panes, a solution and its links has no violations", async () => {
    stubSolution({
      id: "q19",
      markdown: "Apply the Service with `kubectl`.",
      docs: [{ label: "Service", url: "https://kubernetes.io/docs/concepts/" }],
    });
    const { container } = render(<Explain results={attempt([withEvidence])} questionId="q19" />);

    expect(await screen.findByText(/Apply the Service with/)).toBeInTheDocument();
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("the ordinary task — no evidence at all — has no violations", async () => {
    const { container } = render(
      <Explain
        results={attempt([
          task({ id: "q01", title: "Namespaces", checks: [check({ name: "10_ns.sh" })] }),
        ])}
        questionId="q01"
      />,
    );
    expect(await screen.findByText(/Apply the Service with/)).toBeInTheDocument();
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });
});

describe("Explain for a multiple-choice question", () => {
  const mcq = task({
    id: "k01",
    title: "Which controller reconciles a Deployment?",
    domain: "Kubernetes Fundamentals",
    earned: 0,
    total: 1,
    options: ["kubelet", "the Deployment controller", "kube-proxy"],
    selected: [0],
    correct: [1],
  });

  test("reviews the answer instead of reporting a cluster it never had", () => {
    render(<Explain results={attempt([mcq])} questionId="k01" />);

    expect(screen.getByText(strings.explain.answerTitle)).toBeInTheDocument();
    expect(screen.getByText("the Deployment controller")).toBeInTheDocument();
    expect(screen.queryByText(strings.explain.noEvidenceTitle)).toBeNull();
    expect(screen.queryByText(strings.explain.checksTitle)).toBeNull();
    expect(panes()).toHaveLength(0);
  });
});

describe("a historical attempt", () => {
  test("does not ask a session for the reference solution", async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        asked.push(String(input));
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(<Explain results={attempt([withEvidence])} questionId="q19" live={false} />);

    await screen.findByRole("heading", { level: 1 });
    expect(asked.filter((url) => url.includes("/solution"))).toHaveLength(0);
  });

  test("renders the solution stored with the attempt", async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        asked.push(String(input));
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );
    const stored = {
      ...withEvidence,
      solution: "Set the target port to 8080 and re-apply the Service.",
      docs: [{ label: "Service targetPort", url: "https://kubernetes.io/docs/x" }],
    };

    render(<Explain results={attempt([stored])} questionId="q19" live={false} />);

    expect(await screen.findByText(/Set the target port to 8080/)).toBeTruthy();

    expect(screen.getByRole("link", { name: /Service targetPort/ })).toBeTruthy();
    expect(asked.filter((url) => url.includes("/solution"))).toHaveLength(0);
    expect(document.querySelector(".explain-solution .error-text")).toBeNull();
  });

  test("an attempt stored before solutions were kept says so, and reports no error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));

    render(<Explain results={attempt([withEvidence])} questionId="q19" live={false} />);

    expect(await screen.findByText(/saved before reference solutions were kept/i)).toBeTruthy();
    expect(document.querySelector(".explain-solution .error-text")).toBeNull();
  });

  test("a live screen never shows a solution carried in the results, even when the fetch is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("/solution")
          ? new Response(JSON.stringify({ error: "solutions are available once the session has ended" }), { status: 403 })
          : new Response(JSON.stringify({}), { status: 200 }),
      ),
    );
    const leaky = { ...withEvidence, solution: "Never render me." };

    render(<Explain results={attempt([leaky])} questionId="q19" />);

    expect(await screen.findByText(/solutions are available once the session has ended/i)).toBeTruthy();
    expect(screen.queryByText("Never render me.")).toBeNull();
  });
});
