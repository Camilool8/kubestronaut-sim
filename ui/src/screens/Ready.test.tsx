import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Ready } from "./Ready";
import type { PreparingAttempt, SessionSnapshot } from "../api";
import { introSeen, markIntroSeen, resetIntroSeen } from "../components/ExamIntro";
import { strings } from "../strings";

const ready = (over: Partial<PreparingAttempt> = {}): PreparingAttempt => ({
  jobId: "job-ready",
  mode: "exam",
  questionCount: 16,
  startedAt: "2026-08-02T10:14:03Z",
  durationSeconds: 7200,
  awaitStart: true,
  ready: true,
  readyAt: "2026-08-02T10:17:03Z",
  ...over,
});

const running: SessionSnapshot = {
  state: "running",
  bank: "cka-mock-01",
  startedAt: "2026-08-02T10:30:00Z",
  durationSeconds: 7200,
  remainingSeconds: 7200,
  endReason: "",
  mode: "exam",
  untimed: false,
};

interface Call {
  url: string;
  method: string;
}

function stubBegin(answer: () => Response, session: SessionSnapshot = running) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      if (url.endsWith("/api/session/begin")) return answer();
      if (url.endsWith("/api/session")) return new Response(JSON.stringify(session), { status: 200 });
      return new Response("{}", { status: 200 });
    }),
  );
  return calls;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
}

beforeEach(() => {
  markIntroSeen();
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "hidden");
  resetIntroSeen();
});

describe("Ready", () => {
  test("says the tasks are ready and what the attempt will be", () => {
    render(<Ready preparing={ready()} examLabel="CKA" onSessionChange={() => {}} />);

    expect(screen.getByRole("heading", { level: 1, name: "Your 16 tasks are ready" })).toBeTruthy();
    const facts = screen.getByLabelText(strings.ready.factsLabel);
    expect(within(facts).getByText("CKA")).toBeTruthy();
    expect(within(facts).getByText("Exam")).toBeTruthy();
    expect(within(facts).getByText("2h")).toBeTruthy();
    expect(within(facts).getByText("16")).toBeTruthy();
    expect(screen.getByText(strings.ready.clockNote)).toBeTruthy();
  });

  test("offers one primary action that names what it does", () => {
    render(<Ready preparing={ready()} examLabel="CKA" onSessionChange={() => {}} />);

    const start = screen.getByRole("button", { name: "Start the clock" });
    expect(start.className).toContain("btn-primary");
    expect(screen.getByRole("button", { name: strings.intro.open })).toBeTruthy();
  });

  test("pressing Start the clock begins the attempt on the server and hands back the running session", async () => {
    const calls = stubBegin(() => new Response(JSON.stringify(running), { status: 200 }));
    const onSessionChange = vi.fn();
    const user = userEvent.setup();
    render(<Ready preparing={ready()} examLabel="CKA" onSessionChange={onSessionChange} />);

    await user.click(screen.getByRole("button", { name: "Start the clock" }));

    await waitFor(() => expect(onSessionChange).toHaveBeenCalledWith(running));
    const begins = calls.filter((c) => c.url.endsWith("/api/session/begin"));
    expect(begins).toEqual([{ url: "/api/session/begin", method: "POST" }]);
  });

  test("a refused start says so and resyncs, instead of leaving the button spinning", async () => {
    const idle: SessionSnapshot = { ...running, state: "idle", startedAt: "" };
    const calls = stubBegin(
      () =>
        new Response(JSON.stringify({ error: "no attempt is waiting to start" }), { status: 409 }),
      idle,
    );
    const onSessionChange = vi.fn();
    const user = userEvent.setup();
    render(<Ready preparing={ready()} examLabel="CKA" onSessionChange={onSessionChange} />);

    await user.click(screen.getByRole("button", { name: "Start the clock" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no attempt is waiting to start");
    expect(calls.some((c) => c.url === "/api/session" && c.method === "GET")).toBe(true);
    await waitFor(() => expect(onSessionChange).toHaveBeenCalledWith(idle));
    expect(screen.getByRole("button", { name: "Start the clock" })).not.toBeDisabled();
  });

  test("has no WCAG violations", async () => {
    const { container } = render(
      <Ready preparing={ready()} examLabel="CKA" onSessionChange={() => {}} />,
    );
    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations();
  });

  test("a training attempt has no clock to start", () => {
    render(
      <Ready
        preparing={ready({ mode: "training", durationSeconds: 0 })}
        examLabel="CKA"
        onSessionChange={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: strings.ready.startUntimed })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start the clock" })).toBeNull();
    expect(screen.getByText(strings.mode.untimed)).toBeTruthy();
  });
});

describe("Ready and the first-time walkthrough", () => {
  test("opens the walkthrough before the clock for a first-time candidate", () => {
    resetIntroSeen();
    render(<Ready preparing={ready()} examLabel="CKA" onSessionChange={() => {}} />);

    expect(screen.getByRole("dialog", { name: strings.intro.title })).toBeTruthy();
    expect(introSeen()).toBe(false);
  });

  test("dismissing it marks it seen and leaves the candidate on the ready screen", async () => {
    resetIntroSeen();
    const user = userEvent.setup();
    render(<Ready preparing={ready()} examLabel="CKA" onSessionChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: strings.intro.done }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(introSeen()).toBe(true);
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1, name: "Your 16 tasks are ready" }),
    );
  });

  test("stays closed for a returning candidate, and opens on request", async () => {
    const user = userEvent.setup();
    render(<Ready preparing={ready()} examLabel="CKA" onSessionChange={() => {}} />);

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: strings.intro.open }));
    expect(screen.getByRole("dialog", { name: strings.intro.title })).toBeTruthy();
  });
});

describe("Ready in a background tab", () => {
  test("posts a notification when permission was already granted", () => {
    setHidden(true);
    const shown: { title: string; body?: string }[] = [];
    const requestPermission = vi.fn();
    vi.stubGlobal(
      "Notification",
      Object.assign(
        class {
          onclick: (() => void) | null = null;
          constructor(title: string, options?: NotificationOptions) {
            shown.push({ title, body: options?.body });
          }
          close() {}
        },
        { permission: "granted", requestPermission },
      ),
    );

    render(<Ready preparing={ready({ jobId: "job-granted" })} examLabel="CKA" onSessionChange={() => {}} />);

    expect(shown).toEqual([
      { title: "Ready to start · CKA", body: strings.ready.notifyBody(16) },
    ]);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  test("never asks for permission it was not given", () => {
    setHidden(true);
    const constructed = vi.fn();
    const requestPermission = vi.fn();
    vi.stubGlobal(
      "Notification",
      Object.assign(
        class {
          constructor() {
            constructed();
          }
        },
        { permission: "default", requestPermission },
      ),
    );

    render(<Ready preparing={ready({ jobId: "job-default" })} examLabel="CKA" onSessionChange={() => {}} />);

    expect(constructed).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  test("stays quiet in a visible tab", () => {
    const constructed = vi.fn();
    vi.stubGlobal(
      "Notification",
      Object.assign(
        class {
          constructor() {
            constructed();
          }
        },
        { permission: "granted", requestPermission: vi.fn() },
      ),
    );

    render(<Ready preparing={ready({ jobId: "job-visible" })} examLabel="CKA" onSessionChange={() => {}} />);

    expect(constructed).not.toHaveBeenCalled();
  });
});
