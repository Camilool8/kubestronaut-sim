import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Start } from "./screens/Start";
import { Score } from "./screens/Score";
import { ControlProgress } from "./components/ControlProgress";
import { DesktopRequired } from "./components/DesktopRequired";
import { Dialog } from "./components/Dialog";
import { InfoDrawer } from "./components/InfoDrawer";
import { ToastLayer } from "./components/Toast";
import { toastStore } from "./components/toastStore";
import type { ControlJob } from "./api";

// Component-level scans run outside App's <main>, so the page-level
// region rule is not meaningful here. Everything else runs at axe's
// WCAG 2.1 AA defaults. (Color-contrast is skipped automatically in
// jsdom — no layout engine — and is covered by the token design.)
const AXE_OPTS = {
  rules: { region: { enabled: false } },
} as const;

const examJSON = {
  name: "ckad-mock-01",
  title: "CKAD Mock Exam 01",
  durationSeconds: 7200,
  passingScore: 66,
  kubernetesVersion: "1.35",
  questions: [
    { id: "q01", instance: "instance-1", domain: "Config", weight: 5, totalPoints: 5 },
  ],
};

const banksJSON = {
  active: "ckad-mock-01",
  banks: [
    {
      id: "ckad-mock-01",
      title: "CKAD Mock Exam 01",
      certification: "CKAD",
      examType: "hands-on",
      durationSeconds: 7200,
      questionCount: 3,
      available: true,
    },
    {
      id: "cka-mock-01",
      title: "CKA Mock Exam 01",
      certification: "CKA",
      examType: "hands-on",
      durationSeconds: 7200,
      questionCount: 2,
      available: true,
    },
    {
      id: "kcna-mock",
      title: "KCNA Mock Exam",
      certification: "KCNA",
      examType: "mcq",
      available: false,
      comingSoon: true,
      note: "Multiple-choice engine not built yet",
    },
  ],
};

const resultsJSON = {
  bank: "ckad-mock-01",
  gradedAt: "2026-07-24T12:00:00Z",
  earned: 12,
  total: 17,
  percent: 70,
  passingScore: 66,
  passed: true,
  questions: [
    {
      id: "q01",
      instance: "instance-1",
      domain: "Config",
      earned: 5,
      total: 5,
      checks: [
        { name: "10_ns", desc: "namespace exists", points: 2, earned: 2, passed: true, message: "ok" },
        { name: "20_quota", desc: "quota applied", points: 3, earned: 3, passed: true, message: "ok" },
      ],
    },
  ],
};

// Exercises both markdown surfaces the shared renderer produces: a fenced
// block (figure.code-block, figcaption, language chip, copy-block button)
// and an inline value (the CopyableCode button). Opening the solution
// disclosure is what puts both on screen for the scan below.
const solutionJSON = {
  id: "q01",
  markdown: "Apply it with `kubectl apply -f pod.yaml`:\n\n```yaml\nkind: Pod\n```\n",
};

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/api/exam")
        ? examJSON
        : url.includes("/api/control/banks")
          ? banksJSON
          : url.includes("/api/results")
            ? resultsJSON
            : url.includes("/solution")
              ? solutionJSON
              : {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

const runningJob: ControlJob = {
  id: "job-1",
  op: "switch",
  bank: "cka-mock-01",
  startedAt: "2026-07-24T12:00:00Z",
  phase: "recreate-cluster",
  phases: [
    { id: "end-session", label: "End session and lock desktop", state: "done" },
    { id: "recreate-cluster", label: "Recreate Kubernetes cluster", state: "running" },
    { id: "verify", label: "Verify environment", state: "pending" },
  ],
};

describe("axe: no WCAG violations", () => {
  beforeEach(stubFetch);
  afterEach(() => {
    vi.unstubAllGlobals();
    toastStore.clear();
  });

  test("lobby (Start)", async () => {
    const { container } = render(
      <Start
        onSessionChange={() => {}}
        onControlStart={() => {}}
        catalogVersion={0}
        onBanksLoaded={() => {}}
      />,
    );
    await screen.findByText("CKAD Mock Exam 01", { selector: "h1" });
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  // The switch-confirm used to be hand-rolled divs with no role, no
  // aria-modal and no focus trap, and this suite never caught it because
  // the lobby scan never opened it. Scan it open.
  test("lobby with the switch-confirm dialog open", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Start
        onSessionChange={() => {}}
        onControlStart={() => {}}
        catalogVersion={0}
        onBanksLoaded={() => {}}
      />,
    );
    await screen.findByText("CKAD Mock Exam 01", { selector: "h1" });
    await user.click(screen.getByRole("button", { name: /CKA Mock Exam 01/ }));
    // Assert it actually opened — a disabled card would leave this suite
    // silently scanning a closed dialog, which is how the original gap
    // survived.
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  // A 502 from /api/control/banks used to leave the lobby blank — see
  // Async's comment on why its error prop is mandatory. This suite never
  // scanned that state, so the role="alert" card's name/role/value
  // (title, body, dynamic Retry button) never had an axe pass.
  test("lobby catalog error card", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/control/banks")) {
          return new Response(JSON.stringify({ error: "banks unavailable" }), { status: 502 });
        }
        const body = url.includes("/api/exam") ? examJSON : {};
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    const { container } = render(
      <Start
        onSessionChange={() => {}}
        onControlStart={() => {}}
        catalogVersion={0}
        onBanksLoaded={() => {}}
      />,
    );
    // Confirm the error card is actually the thing on screen, not a
    // loading or empty state a mis-routed mock would leave behind.
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("score screen with results", async () => {
    const { container } = render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    await screen.findByText("PASS");
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  // Solutions used to render through a bare, unstyled ReactMarkdown and this
  // suite never scanned one open, so the shared renderer's code-block chrome
  // (figure/figcaption, a copy button with a dynamic per-language aria-label,
  // and inline CopyableCode buttons) never had an axe pass. It also nests a
  // <details> (solution) inside a <details> (question), each with its own
  // interactive summary and now buttons inside both — exactly the shape
  // nested-interactive-content violations hide in. Assert both disclosures
  // are actually expanded before scanning, not merely present in the DOM.
  test("score screen with an open solution", async () => {
    const user = userEvent.setup();
    const { container } = render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    await screen.findByText("PASS");

    await user.click(screen.getByText("q01"));
    await user.click(screen.getByText(/show solution/i));

    // The shared renderer's code-block chrome, present only once the
    // solution has actually loaded and rendered.
    expect(await screen.findByText("yaml")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy yaml code block/i })).toBeInTheDocument();

    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("control progress overlay, running and failed", async () => {
    const { container, rerender } = render(
      <ControlProgress job={runningJob} onRetry={() => {}} onDismiss={() => {}} onBackground={() => {}} />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();

    rerender(
      <ControlProgress
        job={{ ...runningJob, error: "verify: facilitator not healthy" }}
        onRetry={() => {}}
        onDismiss={() => {}}
        onBackground={() => {}}
      />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("desktop-required gate", async () => {
    // The one screen a phone or a 400%-zoomed desktop ever sees.
    const { container } = render(<DesktopRequired verdict="narrow" />);
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("modal dialog", async () => {
    const { container } = render(
      <Dialog title="End the exam?" onClose={() => {}}>
        <p>body</p>
        <button>Cancel</button>
      </Dialog>,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("info drawer", async () => {
    const { container } = render(<InfoDrawer onClose={() => {}} />);
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("toast layer with active toasts", async () => {
    toastStore.push({ kind: "info", message: "Desktop connection restored." });
    toastStore.push({ kind: "warning", message: "5 minutes remaining." });
    const { container } = render(<ToastLayer />);
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });
});
