import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Exam } from "./Exam";
import { QuestionPanel } from "../components/QuestionPanel";
import type { ExamQuestionInfo, SessionSnapshot } from "../api";
import { marksStore } from "../components/marksStore";
import { toastStore } from "../components/toastStore";
import { strings } from "../strings";

// What a session poll must not repeat: the markdown parse, and the VNC dial.
// Both are recorded at the only places they can happen — react-markdown is the
// parse (remark -> mdast -> hast), and the RFB constructor is the dial.
const { parsed, dialled } = vi.hoisted(() => ({
  parsed: [] as string[],
  dialled: [] as string[],
}));

vi.mock("react-markdown", () => ({
  default: ({ children }: { children?: string }) => {
    parsed.push(String(children ?? ""));
    return <div data-testid="markdown">{children}</div>;
  },
}));

vi.mock("@novnc/novnc", () => {
  class FakeRFB {
    constructor(_mount: HTMLElement, url: string) {
      dialled.push(url);
    }
    addEventListener() {}
    removeEventListener() {}
    disconnect() {}
  }
  return { default: FakeRFB };
});

const runningSession: SessionSnapshot = {
  state: "running",
  bank: "ckad-mock-01",
  startedAt: "2026-07-25T12:00:00Z",
  durationSeconds: 7200,
  remainingSeconds: 600,
  endReason: "",
  mode: "exam",
  untimed: false,
};

const idleSession: SessionSnapshot = { ...runningSession, state: "idle" };

const exam = {
  name: "ckad-mock-01",
  title: "CKAD Mock Exam 01",
  examType: "hands-on",
  durationSeconds: 7200,
  passingScore: 66,
  kubernetesVersion: "1.35",
  questionCount: 2,
  questions: [
    {
      id: "q01",
      title: "Namespaces & quotas",
      instance: "instance-1",
      domain: "Config",
      weight: 9,
      totalPoints: 9,
      hintCount: 0,
    },
    {
      id: "q02",
      title: "Expose a Deployment",
      instance: "instance-2",
      domain: "Networking",
      weight: 9,
      totalPoints: 9,
      hintCount: 0,
    },
  ],
};

const body: Record<string, string> = {
  q01: "Create a Namespace `aurora-staging`.",
  q02: "Expose the `inventory` Deployment on port 80.",
};

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/exam")) return json(exam);
      const id = /\/api\/questions\/([^/?]+)/.exec(url)?.[1];
      if (id) return json({ id, markdown: body[id] ?? "" });
      return json({});
    }),
  );
}

// The 10-second poll hands Exam a brand-new snapshot object and a brand-new
// fetchedAt; applySession in App.tsx does exactly this, unconditionally.
function polled(session: SessionSnapshot): SessionSnapshot {
  return { ...session, remainingSeconds: session.remainingSeconds - 10 };
}

beforeEach(() => {
  parsed.length = 0;
  dialled.length = 0;
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  toastStore.clear();
  marksStore.reset();
  window.sessionStorage.clear();
});

describe("Exam question panel across a session poll", () => {
  test("a poll that carries the same question re-parses no markdown", async () => {
    const { rerender } = render(
      <Exam session={idleSession} fetchedAt={Date.now()} onSessionChange={() => {}} />,
    );

    expect(await screen.findByTestId("markdown")).toHaveTextContent("aurora-staging");
    expect(parsed).toEqual([body.q01]);

    const clock = screen.getByRole("timer").textContent;
    rerender(
      <Exam session={polled(idleSession)} fetchedAt={Date.now()} onSessionChange={() => {}} />,
    );

    // The poll reached the tree — the header clock moved with it...
    expect(screen.getByRole("timer").textContent).not.toBe(clock);
    // ...and nothing under it was parsed a second time.
    expect(parsed).toEqual([body.q01]);
  });

  test("ten polls in a row still cost one parse", async () => {
    const { rerender } = render(
      <Exam session={idleSession} fetchedAt={Date.now()} onSessionChange={() => {}} />,
    );
    await screen.findByTestId("markdown");

    let session = idleSession;
    for (let i = 0; i < 10; i++) {
      session = polled(session);
      rerender(<Exam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);
    }

    // Ten polls of ten seconds each, off 600, so the clock is around 8:20.
    expect(screen.getByRole("timer")).toHaveTextContent(/0:08:2\d/);
    expect(parsed).toEqual([body.q01]);
  });

  test("stepping to another question parses the body that actually changed", async () => {
    const user = userEvent.setup();
    render(<Exam session={idleSession} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    await screen.findByTestId("markdown");
    expect(parsed).toEqual([body.q01]);

    await user.click(screen.getByRole("button", { name: /next question/i }));

    await vi.waitFor(() =>
      expect(screen.getByTestId("markdown")).toHaveTextContent("inventory"),
    );
    expect(parsed).toContain(body.q02);
  });
});

describe("QuestionPanel when its inputs really do change", () => {
  const withTitle = (title: string): ExamQuestionInfo[] => [
    { id: "q01", title, instance: "instance-1", domain: "Config", weight: 5, totalPoints: 5, hintCount: 0 },
  ];

  test("a different bank under the same question id redraws the panel", async () => {
    const { rerender } = render(
      <QuestionPanel questions={withTitle("Namespaces & quotas")} selectedId="q01" onSelect={() => {}} />,
    );
    expect(await screen.findByText("Namespaces & quotas")).toBeInTheDocument();

    rerender(
      <QuestionPanel questions={withTitle("Rolling updates")} selectedId="q01" onSelect={() => {}} />,
    );

    expect(screen.getByText("Rolling updates")).toBeInTheDocument();
    expect(screen.queryByText("Namespaces & quotas")).toBeNull();
  });

  test("an empty state that changes still reaches the screen", async () => {
    const { rerender } = render(
      <QuestionPanel
        questions={[]}
        selectedId={null}
        onSelect={() => {}}
        emptyState={<p>Loading the tasks…</p>}
      />,
    );
    expect(await screen.findByText("Loading the tasks…")).toBeInTheDocument();

    rerender(
      <QuestionPanel
        questions={[]}
        selectedId={null}
        onSelect={() => {}}
        emptyState={<p>The tasks could not be loaded.</p>}
      />,
    );

    expect(screen.getByText("The tasks could not be loaded.")).toBeInTheDocument();
  });
});

describe("the exam desktop across a session poll", () => {
  // DesktopViewport puts [onStateChange] on the effect that owns the whole VNC
  // connection. Exam's handleDesktopState is wrapped in useCallback for exactly
  // this reason: without it, every poll would tear the desktop down and re-dial
  // it mid-exam.
  test("a poll does not tear down and re-dial the candidate's desktop", async () => {
    const { rerender } = render(
      <Exam session={runningSession} fetchedAt={Date.now()} onSessionChange={() => {}} />,
    );

    // The skip link belongs to the real DesktopViewport, not to the Suspense
    // fallback, so finding it proves the lazy chunk mounted and dialled.
    expect(await screen.findByRole("link", { name: strings.desktop.skip })).toBeInTheDocument();
    expect(dialled).toHaveLength(1);

    const clock = screen.getByRole("timer").textContent;
    rerender(
      <Exam session={polled(runningSession)} fetchedAt={Date.now()} onSessionChange={() => {}} />,
    );

    expect(screen.getByRole("timer").textContent).not.toBe(clock);
    expect(screen.getByRole("link", { name: strings.desktop.skip })).toBeInTheDocument();
    expect(dialled).toHaveLength(1);
  });

  test("a long attempt's worth of polls leaves the desktop on its first dial", async () => {
    const { rerender } = render(
      <Exam session={runningSession} fetchedAt={Date.now()} onSessionChange={() => {}} />,
    );
    await screen.findByRole("link", { name: strings.desktop.skip });
    expect(dialled).toHaveLength(1);

    let session = runningSession;
    for (let i = 0; i < 20; i++) {
      session = polled(session);
      rerender(<Exam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);
    }

    // Twenty polls of ten seconds each, off 600, so the clock is around 6:40.
    expect(screen.getByRole("timer")).toHaveTextContent(/0:06:4\d/);
    expect(dialled).toHaveLength(1);
  });
});
