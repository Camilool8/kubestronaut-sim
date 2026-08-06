import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Exams } from "./screens/Exams";
import { Mode } from "./screens/Mode";
import { Progress } from "./screens/Progress";
import { Score } from "./screens/Score";
import { ControlProgress } from "./components/ControlProgress";
import { BootProgress } from "./screens/BootProgress";
import { ClipboardPanel } from "./components/ClipboardPanel";
import { DomainBreakdown } from "./components/DomainBreakdown";
import { HintTray } from "./components/HintTray";
import { KeyboardSettings } from "./components/KeyboardSettings";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { DesktopRequired } from "./components/DesktopRequired";
import { NavBar } from "./components/NavBar";
import { Dialog } from "./components/Dialog";
import { ExamIntro } from "./components/ExamIntro";
import { InfoDrawer } from "./components/InfoDrawer";
import { BackgroundJobChip } from "./components/BackgroundJobChip";
import { PanelResizer } from "./components/PanelResizer";
import { QuestionPanel } from "./components/QuestionPanel";
import { ToastLayer } from "./components/Toast";
import { McqExam } from "./screens/McqExam";
import { McqAnswerReview } from "./components/McqAnswerReview";
import { HostedBooting } from "./screens/HostedBooting";
import { HostedSignIn } from "./screens/HostedSignIn";
import { HostedStart } from "./screens/HostedStart";
import { EndSessionDialog, SessionActions, SessionChip } from "./components/SessionChip";
import { HEADER_COMPACT_QUERY, MCQ_COMPACT_QUERY, SPLIT_QUERY } from "./lib/useMediaQuery";
import { matchMediaMock } from "./test/setup";
import { marksStore } from "./components/marksStore";
import { toastStore } from "./components/toastStore";
import { strings } from "./strings";
import type { ControlJob, ExamQuestionInfo, SessionSnapshot } from "./api";

const AXE_OPTS = {
  rules: { region: { enabled: false } },
} as const;

const examJSON = {
  name: "ckad-mock-01",
  title: "CKAD Mock Exam 01",
  certification: "CKAD",
  examType: "hands-on",
  durationSeconds: 7200,
  passingScore: 66,
  kubernetesVersion: "1.35",
  questionCount: 1,
  questions: [
    { id: "q01", instance: "instance-1", domain: "Config", weight: 5, totalPoints: 5, hintCount: 0 },
  ],

  modes: [
    {
      id: "training",
      durationSeconds: 0,
      untimed: true,
      helpAllowed: true,
      gradesPerTask: true,
      recorded: false,
      recommended: false,
    },
    {
      id: "speed",
      durationSeconds: 3600,
      untimed: false,
      helpAllowed: false,
      gradesPerTask: false,
      recorded: true,
      recommended: true,
    },
    {
      id: "exam",
      durationSeconds: 7200,
      untimed: false,
      helpAllowed: false,
      gradesPerTask: false,
      recorded: true,
      recommended: false,
    },
  ],
};

const catalogJSON = {
  active: "ckad-mock-01",
  exams: [
    {
      id: "ckad-mock-01",
      title: "CKAD Mock Exam 01",
      certification: "CKAD",
      examType: "hands-on",
      durationSeconds: 7200,
      questionCount: 3,
      available: true,
      progress: {
        attempts: 2,
        counted: 2,
        bestPercent: 74,
        passed: true,
        lastAttemptAt: "2026-07-30T18:00:00Z",
        weakDomains: [],
      },
    },
    {
      id: "cka-mock-01",
      title: "CKA Mock Exam 01",
      certification: "CKA",
      examType: "hands-on",
      durationSeconds: 7200,
      questionCount: 2,
      available: true,
      progress: { attempts: 0, counted: 0, passed: false, weakDomains: [] },
    },
    {
      id: "kcna-mock",
      title: "KCNA Mock Exam",
      certification: "KCNA",
      examType: "mcq",
      available: false,
      comingSoon: true,
      note: "Multiple-choice engine not built yet",
      progress: { attempts: 0, counted: 0, passed: false, weakDomains: [] },
    },
  ],
  summary: {
    attempts: 2,
    passedCount: 1,
    trackCount: 5,
    weakDomains: [{ domain: "Config", earned: 4, total: 10, percent: 40, attempts: 2 }],
  },
};

const historyJSON = {
  attempts: [
    {
      id: "a1",
      bank: "ckad-mock-01",
      certification: "CKAD",
      examTitle: "CKAD Mock Exam 01",
      examType: "hands-on",
      mode: "exam",
      startedAt: "2026-07-30T16:00:00Z",
      gradedAt: "2026-07-30T18:00:00Z",
      durationSeconds: 7200,
      elapsedSeconds: 5400,
      questionCount: 3,
      earned: 12,
      total: 17,
      percent: 74,
      passingScore: 66,
      passed: true,
      counted: true,
    },

    {
      id: "a2",
      bank: "ckad-mock-01",
      certification: "CKAD",
      examType: "hands-on",
      mode: "training",
      startedAt: "2026-07-28T16:00:00Z",
      gradedAt: "2026-07-28T17:00:00Z",
      questionCount: 1,
      earned: 2,
      total: 5,
      percent: 40,
      passingScore: 66,
      passed: false,
      counted: false,
      domainFilter: ["Config"],
    },
  ],
  summary: catalogJSON.summary,
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

const solutionJSON = {
  id: "q01",
  markdown: "Apply it with `kubectl apply -f pod.yaml`:\n\n```yaml\nkind: Pod\n```\n",
};

const questionJSON = {
  id: "q01",
  instance: "instance-1",
  domain: "Config",
  markdown: [
    "# Question 1 | Namespaces & ResourceQuota",
    "",
    "1. Create a Namespace `aurora-staging`.",
    "2. Add a ResourceQuota named `aurora-quota`.",
  ].join("\n"),
};

const examQuestions: ExamQuestionInfo[] = [
  { id: "q01", instance: "instance-1", domain: "Config", weight: 5, totalPoints: 5, hintCount: 0 },
  { id: "q02", instance: "instance-2", domain: "Networking", weight: 7, totalPoints: 7, hintCount: 0 },
];

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/api/exam")
        ? examJSON
        : url.includes("/api/catalog")
          ? catalogJSON
          : url.includes("/api/history")
            ? historyJSON
            : url.includes("/api/results")
              ? resultsJSON
              : url.includes("/solution")
                ? solutionJSON
                : url.includes("/api/questions/")
                  ? questionJSON
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
    marksStore.reset();

    window.location.hash = "";

    matchMediaMock([]);
  });

  test("exam question panel", async () => {
    const { container } = render(
      <QuestionPanel
        questions={examQuestions}
        selectedId="q01"
        onSelect={() => {}}
      />,
    );
    await screen.findByRole("button", { name: /aurora-staging/ });
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("exam question panel with the jump grid open", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <QuestionPanel
        questions={examQuestions}
        selectedId="q02"
        onSelect={() => {}}
      />,
    );
    await user.click(await screen.findByRole("button", { name: /show all questions/i }));
    expect(container.querySelector("#question-jump")).not.toBeNull();
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("backgrounded job chip", async () => {
    const { container } = render(
      <BackgroundJobChip job={runningJob} bankTitle="CKA Mock Exam 01" onReopen={() => {}} />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("panel resizer", async () => {
    matchMediaMock([SPLIT_QUERY]);
    const { container } = render(
      <div className="exam-body">
        <section id="question-panel" />
        <PanelResizer panelId="question-panel" />
      </div>,
    );
    expect(container.querySelector('[role="separator"]')).not.toBeNull();
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("exam selector", async () => {
    const { container } = render(
      <Exams onControlStart={() => {}} catalogVersion={0} onBanksLoaded={() => {}} />,
    );
    await screen.findByText("CKAD", { selector: "h2" });
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("mode selector", async () => {
    const { container } = render(
      <Mode bankId="ckad-mock-01" catalogVersion={0} onSessionChange={() => {}} />,
    );
    await screen.findByRole("button", { name: /start exam/i });
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("progress dashboard", async () => {
    const { container } = render(<Progress catalogVersion={0} />);
    await screen.findByRole("table");
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("exam selector with the switch-confirm dialog open", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Exams onControlStart={() => {}} catalogVersion={0} onBanksLoaded={() => {}} />,
    );
    await screen.findByText("CKA", { selector: "h2" });

    await user.click(screen.getAllByRole("button", { name: /choose a mode/i })[1]);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("exam selector catalog error card", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/catalog")) {
          return new Response(JSON.stringify({ error: "catalog unavailable" }), { status: 502 });
        }
        const body = url.includes("/api/exam") ? examJSON : {};
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    const { container } = render(
      <Exams onControlStart={() => {}} catalogVersion={0} onBanksLoaded={() => {}} />,
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("score screen with results", async () => {
    const { container } = render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    await screen.findByRole("heading", { level: 1, name: /passed/i });
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("score screen deep dive, with the reference solution rendered", async () => {
    const user = userEvent.setup();
    const { container } = render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    await screen.findByRole("heading", { level: 1, name: /passed/i });

    await user.click(screen.getByText("q01"));
    await user.click(screen.getByRole("link", { name: /full explanation/i }));

    expect(await screen.findByText("yaml")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy yaml code block/i })).toBeInTheDocument();

    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("control progress overlay, running and failed", async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <ControlProgress job={runningJob} onRetry={() => {}} onDismiss={() => {}} onBackground={() => {}} />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();

    await user.click(screen.getByText(/show build log/i));
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

  test("boot progress, building", async () => {
    const { container } = render(
      <BootProgress
        boot={{
          state: "booting",
          phase: "seed",
          label: "Setting up the exam questions",
          detail: "question 7 of 22",
          error: "",
          step: 7,
          totalSteps: 8,
          startedAt: "2026-07-27T12:00:00Z",
        }}
        onRetry={() => {}}
      />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("boot progress, failed", async () => {
    const { container } = render(
      <BootProgress
        boot={{
          state: "failed",
          phase: "cni",
          label: "Installing the pod network",
          detail: "",
          error: "step failed: kubectl apply -f /opt/sim/calico.yaml (exit 1)",
          step: 5,
          totalSteps: 8,
          startedAt: "2026-07-27T12:00:00Z",
        }}
        onRetry={() => {}}
      />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("domain breakdown", async () => {
    const { container } = render(
      <DomainBreakdown
        questions={[
          {
            id: "q01",
            instance: "instance-1",
            domain: "Services and Networking",
            earned: 4,
            total: 10,
            checks: [],
          },
        ]}
      />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("hint tray", async () => {
    const { container } = render(<HintTray questionId="q01" hintCount={2} />);
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("clipboard panel", async () => {
    const { container } = render(<ClipboardPanel onClose={() => {}} />);
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("keyboard settings popover", async () => {
    const { container } = render(
      <KeyboardSettings onClose={() => {}} onShowHelp={() => {}} />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("shortcut help", async () => {
    const { container } = render(<ShortcutHelp onClose={() => {}} />);
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("desktop-required gate", async () => {
    const { container } = render(<DesktopRequired verdict="narrow" />);
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("navbar at the top of the app", async () => {
    const { container } = render(
      <NavBar
        trail={[{ label: "Choose an exam" }]}
        nav={[
          { label: "Exams", to: "/exams", icon: "grid" },
          { label: "Progress", to: "/progress", icon: "chart", current: true },
        ]}
      />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("navbar one step down, with a trail", async () => {
    const { container } = render(
      <NavBar
        trail={[{ label: "Exams", to: "/exams" }, { label: "CKAD" }]}
        nav={[{ label: "Exams", to: "/exams", icon: "grid" }]}
      />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("navbar, narrow, with the menu open", async () => {
    matchMediaMock([HEADER_COMPACT_QUERY, MCQ_COMPACT_QUERY]);
    const user = userEvent.setup();
    const { container } = render(
      <NavBar
        trail={[{ label: "Your path" }]}
        nav={[
          { label: "Exams", to: "/exams", icon: "grid" },
          { label: "Progress", to: "/progress", icon: "chart", current: true },
        ]}
        session={{
          login: "octocat",
          session: {
            kind: "practical",
            pod: "sim-session-practical-1",
            state: "ready",
            startedAt: "2026-08-05T09:00:00Z",
            expiresAt: "2026-08-05T19:00:00Z",
            lastSeen: "2026-08-05T09:00:00Z",
          },
          onChanged: () => {},
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: strings.header.menuLabel }));
    expect(screen.getByRole("button", { name: /Exams/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /End session/ })).toBeInTheDocument();
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

  test("exam intro card", async () => {
    const { container } = render(<ExamIntro onClose={() => {}} />);
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("toast layer with active toasts", async () => {
    toastStore.push({ kind: "info", message: "Desktop connection restored." });
    toastStore.push({ kind: "warning", message: "5 minutes remaining." });
    const { container } = render(<ToastLayer />);
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  const mcqSession: SessionSnapshot = {
    state: "running",
    bank: "kcna-mock",
    startedAt: "2026-07-31T12:00:00Z",
    durationSeconds: 5400,
    remainingSeconds: 5000,
    endReason: "",
    mode: "exam",
    untimed: false,
  };

  const mcqExamJSON = {
    name: "kcna-mock",
    title: "KCNA Mock Exam",
    examType: "mcq",
    durationSeconds: 5400,
    passingScore: 75,
    kubernetesVersion: "1.35",
    questions: [
      { id: "q01", domain: "Kubernetes Fundamentals", weight: 1, totalPoints: 1, hintCount: 0 },
      {
        id: "q02",
        domain: "Container Orchestration",
        weight: 1,
        totalPoints: 1,
        hintCount: 0,
        multi: true,
      },
    ],
  };

  const mcqQuestionJSON = {
    id: "q01",
    domain: "Kubernetes Fundamentals",
    markdown: "Which component persists cluster state?",
    options: ["The kubelet", "etcd", "kube-proxy"],
    multi: false,
  };

  function stubMcqFetch(answers: Record<string, number[]> = {}) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes("/api/exam")
          ? mcqExamJSON
          : url.includes("/api/answers")
            ? { answers }
            : url.includes("/solution")
              ? { id: "q01", markdown: "**etcd** is correct: it stores cluster state." }
              : url.includes("/api/questions/q02")
                ? { ...mcqQuestionJSON, id: "q02", multi: true, options: ["CNI", "CSI", "CRI", "OCI"] }
                : url.includes("/api/questions/")
                  ? mcqQuestionJSON
                  : {};
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
  }

  test("mcq exam screen, single-answer question", async () => {
    stubMcqFetch();
    const { container } = render(
      <McqExam session={mcqSession} fetchedAt={Date.now()} onSessionChange={() => {}} />,
    );
    await screen.findByText("Which component persists cluster state?");
    expect(screen.getByRole("checkbox", { name: /etcd/ })).toBeInTheDocument();
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("mcq exam screen, multi-select question with the jump grid open", async () => {
    stubMcqFetch({ q01: [1] });
    const user = userEvent.setup();
    const { container } = render(
      <McqExam session={mcqSession} fetchedAt={Date.now()} onSessionChange={() => {}} />,
    );
    await screen.findByText("Which component persists cluster state?");
    await user.click(screen.getByRole("button", { name: /show all questions/i }));
    expect(container.querySelector("#mcq-jump")).not.toBeNull();
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("mcq navbar menu, narrow, with the attempt section open", async () => {
    matchMediaMock([HEADER_COMPACT_QUERY, MCQ_COMPACT_QUERY]);
    stubMcqFetch();
    const user = userEvent.setup();
    const { container } = render(
      <McqExam session={mcqSession} fetchedAt={Date.now()} onSessionChange={() => {}} />,
    );
    await screen.findByText("Which component persists cluster state?");
    await user.click(screen.getByRole("button", { name: strings.header.menuLabel }));
    expect(screen.getByRole("button", { name: /submit exam/i })).toBeInTheDocument();
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("mcq navigator as a bottom sheet", async () => {
    matchMediaMock([MCQ_COMPACT_QUERY]);
    stubMcqFetch({ q01: [1] });
    const user = userEvent.setup();
    const { container } = render(
      <McqExam session={mcqSession} fetchedAt={Date.now()} onSessionChange={() => {}} />,
    );
    await screen.findByText("Which component persists cluster state?");
    await user.click(screen.getByRole("button", { name: /question 1 of 2/i }));
    expect(screen.getByRole("dialog", { name: /questions/i })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("mcq submit dialog with the unanswered list", async () => {
    stubMcqFetch({ q01: [1] });
    const user = userEvent.setup();
    const { container } = render(
      <McqExam session={mcqSession} fetchedAt={Date.now()} onSessionChange={() => {}} />,
    );
    await screen.findByText("Which component persists cluster state?");
    await user.click(screen.getByRole("button", { name: strings.header.menuLabel }));
    await user.click(screen.getByRole("button", { name: /submit exam/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/1 question is unanswered/)).toBeInTheDocument();
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("mcq training check-answer revealed", async () => {
    stubMcqFetch();
    const user = userEvent.setup();
    const { container } = render(
      <McqExam
        session={{ ...mcqSession, mode: "training", untimed: true }}
        fetchedAt={Date.now()}
        onSessionChange={() => {}}
      />,
    );
    await screen.findByText("Which component persists cluster state?");
    await user.click(screen.getByText(/check answer/i));
    expect(await screen.findByText(/stores cluster state/)).toBeInTheDocument();
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("score answer review (mcq)", async () => {
    const { container } = render(
      <McqAnswerReview
        question={{
          id: "q02",
          instance: "",
          domain: "Container Orchestration",
          earned: 0,
          total: 1,
          checks: [],
          selected: [0, 2],
          correct: [0, 1],
          options: ["CNI", "CSI", "CRI", "OCI"],
          multi: true,
        }}
      />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("hosted sign-in", async () => {
    const { container } = render(
      <HostedSignIn
        me={{
          authenticated: false,
          authMode: "github",
          loginURL: "/hub/auth/login",
          seats: { practical: { used: 1, total: 3 } },
        }}
      />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("hosted lobby, with a place in the queue", async () => {
    const { container } = render(
      <HostedStart
        me={{
          authenticated: true,
          authMode: "github",
          user: { id: "1", login: "octocat" },
          seats: { practical: { used: 3, total: 3 }, mcq: { used: 0, total: 30 } },
          queue: { position: 2 },
        }}
        onChanged={() => {}}
      />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("hosted boot screen", async () => {
    const { container } = render(
      <HostedBooting
        session={{
          kind: "practical",
          pod: "sim-session-practical-1",
          state: "starting",
          startedAt: "2026-08-04T11:55:00Z",
          expiresAt: "2026-08-04T21:55:00Z",
          lastSeen: "2026-08-04T12:00:00Z",
        }}
        onChanged={() => {}}
      />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("the boot screen, rebuilding", async () => {
    const { container } = render(
      <HostedBooting
        session={{
          kind: "practical",
          bank: "ckad-mock-01",
          pod: "sim-session-practical-583231",
          state: "starting",
          op: "reset",
          startedAt: "2026-08-05T09:00:00Z",
          expiresAt: "2026-08-05T19:00:00Z",
          lastSeen: "2026-08-05T09:00:00Z",
        }}
        onChanged={() => {}}
      />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("session chip with a lease running out", async () => {
    const { container } = render(
      <SessionChip
        login="octocat"
        session={{
          kind: "practical",
          pod: "sim-session-practical-1",
          state: "ready",
          startedAt: "2026-08-04T11:00:00Z",
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          lastSeen: "2026-08-04T12:00:00Z",
        }}
      />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("session actions with an active session", async () => {
    const { container } = render(
      <SessionActions
        session={{
          kind: "practical",
          pod: "sim-session-practical-1",
          state: "ready",
          startedAt: "2026-08-04T11:00:00Z",
          expiresAt: "2026-08-04T21:00:00Z",
          lastSeen: "2026-08-04T12:00:00Z",
        }}
        onEnd={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: strings.hosted.endSession })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: strings.hosted.signOut })).toBeInTheDocument();
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("end-session confirmation dialog", async () => {
    const { container } = render(<EndSessionDialog onClose={() => {}} onChanged={() => {}} />);

    expect(screen.getByRole("dialog")).toHaveTextContent(strings.hosted.endConfirmTitle);
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });
});
