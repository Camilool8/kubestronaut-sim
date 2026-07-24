import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Start } from "./screens/Start";
import { Score } from "./screens/Score";
import { ControlProgress } from "./components/ControlProgress";
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
      <Start onSessionChange={() => {}} onControlStart={() => {}} />,
    );
    await screen.findByText("CKAD Mock Exam 01", { selector: "h1" });
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("score screen with results", async () => {
    const { container } = render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    await screen.findByText("PASS");
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("control progress overlay, running and failed", async () => {
    const { container, rerender } = render(
      <ControlProgress job={runningJob} onRetry={() => {}} onDismiss={() => {}} />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();

    rerender(
      <ControlProgress
        job={{ ...runningJob, error: "verify: facilitator not healthy" }}
        onRetry={() => {}}
        onDismiss={() => {}}
      />,
    );
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
