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
import { AppHeader } from "./components/AppHeader";
import { Dialog } from "./components/Dialog";
import { ExamIntro } from "./components/ExamIntro";
import { InfoDrawer } from "./components/InfoDrawer";
import { BackgroundJobChip } from "./components/BackgroundJobChip";
import { PanelResizer } from "./components/PanelResizer";
import { QuestionPanel } from "./components/QuestionPanel";
import { ToastLayer } from "./components/Toast";
import { McqExam } from "./screens/McqExam";
import { McqAnswerReview } from "./components/McqAnswerReview";
import { SPLIT_QUERY } from "./lib/useMediaQuery";
import { matchMediaMock } from "./test/setup";
import { marksStore } from "./components/marksStore";
import { toastStore } from "./components/toastStore";
import type { ControlJob, ExamQuestionInfo, SessionSnapshot } from "./api";

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
  certification: "CKAD",
  examType: "hands-on",
  durationSeconds: 7200,
  passingScore: 66,
  kubernetesVersion: "1.35",
  questionCount: 1,
  questions: [
    { id: "q01", instance: "instance-1", domain: "Config", weight: 5, totalPoints: 5, hintCount: 0 },
  ],
  // The mode screen renders one card per entry and one capability row
  // per flag, so the scan needs all three or it covers a third of it.
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

// GET /api/catalog — the bank list joined to attempt history. The CKAD
// row carries a counted, passing attempt so the scan covers the card's
// best-attempt bar as well as its empty state; the CKA row has none.
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
    // The uncounted row: a drill, which must render with its mark rather
    // than be hidden.
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

// Exercises both markdown surfaces the shared renderer produces: a fenced
// block (figure.code-block, figcaption, language chip, copy-block button)
// and an inline value (the CopyableCode button). Opening the solution
// disclosure is what puts both on screen for the scan below.
const solutionJSON = {
  id: "q01",
  markdown: "Apply it with `kubectl apply -f pod.yaml`:\n\n```yaml\nkind: Pod\n```\n",
};

// Shaped like real bank content: an h1 title, an italic instance line and
// numbered steps with inline values. The heading level matters — every
// question.md in the bank opens with one.
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

// Two domains, so the jump grid's grouping headings are exercised.
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
  });

  // The exam screen was the one surface this suite never scanned, which is
  // how a second h1 (the topbar's, plus every question.md's own) and a
  // selection state with no aria-current both survived. QuestionPanel is
  // scanned directly rather than through Exam, which lazy-imports noVNC.
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

  // The chip carries a progressbar, which axe requires to have an
  // accessible name — the exact thing an unnamed role="progressbar" gets
  // flagged for.
  test("backgrounded job chip", async () => {
    const { container } = render(
      <BackgroundJobChip job={runningJob} bankTitle="CKA Mock Exam 01" onReopen={() => {}} />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  // axe's aria-required-attr demands aria-valuenow on a focusable
  // separator, which is exactly the attribute this pattern invites you to
  // leave off. The default matchMedia stub answers false to everything, so
  // the resizer has to be opted in.
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

  // Three mode cards, each with a capability list whose state is carried
  // by an sr-only word beside a decorative glyph. If that word were ever
  // dropped the list would say nothing at all to a screen reader, and a
  // scan of a single card would not show it.
  test("mode selector", async () => {
    const { container } = render(
      <Mode bankId="ckad-mock-01" catalogVersion={0} onSessionChange={() => {}} />,
    );
    await screen.findByRole("button", { name: /start exam/i });
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  // The dashboard is the one screen in the product with a real <table>
  // and a real <input>, which are the two things axe has the most to say
  // about: a header cell with no scope and a file picker with no label
  // are both silent on screen and both fatal to a screen reader.
  test("progress dashboard", async () => {
    const { container } = render(<Progress catalogVersion={0} />);
    await screen.findByRole("table");
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  // The switch-confirm used to be hand-rolled divs with no role, no
  // aria-modal and no focus trap, and this suite never caught it because
  // the selector scan never opened it. Scan it open.
  test("exam selector with the switch-confirm dialog open", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Exams onControlStart={() => {}} catalogVersion={0} onBanksLoaded={() => {}} />,
    );
    await screen.findByText("CKA", { selector: "h2" });
    // The second live card is not the active bank, so choosing it is a
    // rebuild and must go through the dialog.
    await user.click(screen.getAllByRole("button", { name: /choose a mode/i })[1]);
    // Assert it actually opened — a disabled card would leave this suite
    // silently scanning a closed dialog, which is how the original gap
    // survived.
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  // A 502 from the catalog endpoint used to leave the lobby blank — see
  // Async's comment on why its error prop is mandatory. This suite never
  // scanned that state, so the role="alert" card's name/role/value
  // (title, body, dynamic Retry button) never had an axe pass. (The lobby
  // reads GET /api/catalog now rather than the conductor's
  // /api/control/banks; the failure mode it guards is the same one.)
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
    // Confirm the error card is actually the thing on screen, not a
    // loading or empty state a mis-routed mock would leave behind.
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  // The verdict is the screen's h1 now ("Passed — 70% against a 66%
  // threshold"), not a "PASS" badge under a bare percentage. Waiting on
  // the heading by name is also what keeps the scan off the grading
  // state, whose own h1 is on screen until the first poll lands.
  test("score screen with results", async () => {
    const { container } = render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    await screen.findByRole("heading", { level: 1, name: /passed/i });
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
    await screen.findByRole("heading", { level: 1, name: /passed/i });

    await user.click(screen.getByText("q01"));
    await user.click(screen.getByText(/show solution/i));

    // The shared renderer's code-block chrome, present only once the
    // solution has actually loaded and rendered.
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

    // The build log pane is a focusable scroll region; scan it open.
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

  // The first screen anyone ever sees on a cold start, and the one a
  // candidate stares at for several minutes.
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

  // The clipboard panel is a form: two labelled controls and a live
  // region of remote text. Labels are the whole point of it being usable.
  // A data table with row headers — the one place in the app where
  // header association actually carries meaning for a screen reader.
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
    // The one screen a phone or a 400%-zoomed desktop ever sees.
    const { container } = render(<DesktopRequired verdict="narrow" />);
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  // The header is on nearly every screen, so anything wrong here is
  // wrong everywhere. Both variants are scanned: they differ in what
  // leads the left cluster, which is exactly where the landmark, the
  // link and the nav all live.
  test("app header, brand variant", async () => {
    const { container } = render(
      <AppHeader
        crumb="Choose an exam"
        nav={[
          { label: "History", to: "/progress" },
          { label: "Packs", to: "/packs", current: true },
        ]}
      />,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("app header, back variant", async () => {
    const { container } = render(
      <AppHeader
        variant="back"
        back={{ label: "Exams", to: "/exams" }}
        crumb="CKAD"
        detail="Certified Kubernetes Application Developer"
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

  test("exam intro card", async () => {
    // The schematic is a div tree carrying role="img"; the scan is what
    // holds it to having an accessible name rather than being a pile of
    // unlabelled boxes a screen reader walks through one at a time.
    const { container } = render(<ExamIntro onClose={() => {}} />);
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  test("toast layer with active toasts", async () => {
    toastStore.push({ kind: "info", message: "Desktop connection restored." });
    toastStore.push({ kind: "warning", message: "5 minutes remaining." });
    const { container } = render(<ToastLayer />);
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  // ---- mcq engine surfaces. Every state the multiple-choice screen can
  // put on screen gets its own scan: unscanned states are exactly how
  // past violations survived (see the exam-panel comment above).

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

  test("mcq submit dialog with the unanswered list", async () => {
    stubMcqFetch({ q01: [1] });
    const user = userEvent.setup();
    const { container } = render(
      <McqExam session={mcqSession} fetchedAt={Date.now()} onSessionChange={() => {}} />,
    );
    await screen.findByText("Which component persists cluster state?");
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

  // The review renders three marked states (correct-selected,
  // correct-missed, wrong-selected) plus a neutral row — all four at
  // once here, each carrying icon + text, never colour alone.
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
});
