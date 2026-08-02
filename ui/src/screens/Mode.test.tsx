import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Mode } from "./Mode";
import type { ExamInfo, SessionSnapshot } from "../api";

const modes = [
  {
    id: "training" as const,
    durationSeconds: 0,
    untimed: true,
    helpAllowed: true,
    gradesPerTask: true,
    recorded: false,
    recommended: false,
  },
  {
    id: "speed" as const,
    durationSeconds: 3600,
    untimed: false,
    helpAllowed: false,
    gradesPerTask: false,
    recorded: true,
    recommended: true,
  },
  {
    id: "exam" as const,
    durationSeconds: 7200,
    untimed: false,
    helpAllowed: false,
    gradesPerTask: false,
    recorded: true,
    recommended: false,
  },
];

const question = (id: string, domain: string) => ({
  id,
  instance: "instance-1",
  domain,
  weight: 5,
  totalPoints: 5,
  hintCount: 0,
});

const ckad: ExamInfo = {
  name: "ckad-mock-01",
  title: "CKAD Mock Exam 01",
  certification: "CKAD",
  examType: "hands-on",
  durationSeconds: 7200,
  passingScore: 66,
  kubernetesVersion: "1.35",
  questionCount: 3,
  questions: [
    question("q01", "Application Design and Build"),
    question("q02", "Application Design and Build"),
    question("q03", "Services and Networking"),
  ],
  modes,
};

let exam: ExamInfo = ckad;
let startStatus = 200;
let startCalls: string[] = [];
const runningSession: SessionSnapshot = {
  state: "running",
  bank: "ckad-mock-01",
  startedAt: "2026-08-01T10:00:00Z",
  durationSeconds: 7200,
  remainingSeconds: 7200,
  endReason: "",
  mode: "exam",
  untimed: false,
};

function mockApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/exam")) {
        return new Response(JSON.stringify(exam), { status: 200 });
      }
      if (url.endsWith("/api/session/start") && init?.method === "POST") {
        startCalls.push(JSON.parse(String(init.body)).mode);
        if (startStatus === 409) {
          return new Response(JSON.stringify({ error: "already running" }), { status: 409 });
        }
        return new Response(JSON.stringify(runningSession), { status: 200 });
      }
      if (url.endsWith("/api/session")) {
        return new Response(JSON.stringify(runningSession), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

const renderMode = (onSessionChange = () => {}, bankId = "ckad-mock-01") =>
  render(<Mode bankId={bankId} catalogVersion={0} onSessionChange={onSessionChange} />);

/** The card whose heading is this mode. */
const cardFor = (label: string) =>
  screen.getByRole("heading", { name: label }).closest("article") as HTMLElement;

beforeEach(() => {
  exam = ckad;
  startStatus = 200;
  startCalls = [];
  window.history.replaceState(null, "", window.location.pathname);
  mockApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", window.location.pathname);
});

describe("the mode cards", () => {
  test("one card per mode the server offers, with its clock", async () => {
    renderMode();
    await screen.findByRole("heading", { name: "Training" });

    expect(within(cardFor("Training")).getByText("No limit")).toBeInTheDocument();
    expect(within(cardFor("Mastery")).getByText("1h")).toBeInTheDocument();
    expect(within(cardFor("Exam")).getByText("2h")).toBeInTheDocument();
  });

  // A shortened clock only reads as shortened with the real one beside
  // it, and it is said in words: a line through a number is a signal
  // only a sighted reader gets.
  test("a shortened clock names the real one; a full one does not", async () => {
    renderMode();
    await screen.findByRole("heading", { name: "Mastery" });

    expect(within(cardFor("Mastery")).getByText("2h in the real exam")).toBeInTheDocument();
    expect(within(cardFor("Exam")).queryByText(/in the real exam/)).not.toBeInTheDocument();
  });

  // The point of the whole mode-metadata change: every row is generated
  // from the flag the facilitator enforces with, so a card cannot
  // promise something the server then refuses.
  test("the capability rows follow the server's flags, and say yes or no in words", async () => {
    renderMode();
    await screen.findByRole("heading", { name: "Training" });

    const training = within(cardFor("Training")).getByRole("list", {
      name: "What this mode allows",
    });
    // The glyphs are decoration; these words are what carries the state.
    expect(within(training).getByText("Hints and reference solutions").textContent).toContain(
      "Yes:",
    );
    expect(within(training).getByText("Kept as an attempt").textContent).toContain("No:");

    const real = within(cardFor("Exam")).getByRole("list", { name: "What this mode allows" });
    expect(within(real).getByText("Hints and reference solutions").textContent).toContain("No:");
    expect(within(real).getByText("Kept as an attempt").textContent).toContain("Yes:");
  });

  // Recommended is drawn in accent, which is one channel. The word is
  // the second, and it is the only one a screen reader gets.
  test("exactly one card is recommended, and it says so", async () => {
    renderMode();
    await screen.findByRole("heading", { name: "Mastery" });

    expect(screen.getAllByText("Recommended")).toHaveLength(1);
    expect(within(cardFor("Mastery")).getByText("Recommended")).toBeInTheDocument();
  });

  test("falls back to a full set of cards when the server sends no modes", async () => {
    exam = { ...ckad, modes: undefined };
    renderMode();
    await screen.findByRole("heading", { name: "Training" });

    expect(screen.getByRole("heading", { name: "Mastery" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Exam" })).toBeInTheDocument();
  });
});

describe("starting", () => {
  test("starts the mode whose button was pressed and reports the session up", async () => {
    const user = userEvent.setup();
    const onSessionChange = vi.fn();
    renderMode(onSessionChange);
    await screen.findByRole("heading", { name: "Training" });

    await user.click(screen.getByRole("button", { name: "Start Training" }));
    await waitFor(() => expect(startCalls).toEqual(["training"]));
    expect(onSessionChange).toHaveBeenCalledWith(runningSession);
  });

  // A 409 means something already changed session state under us — the
  // poller, or a concurrent start. Refetch the truth rather than showing
  // an error over a session that is running.
  test("a 409 refetches the authoritative session instead of erroring", async () => {
    const user = userEvent.setup();
    const onSessionChange = vi.fn();
    startStatus = 409;
    renderMode(onSessionChange);
    await screen.findByRole("heading", { name: "Exam" });

    await user.click(screen.getByRole("button", { name: "Start Exam" }));
    await waitFor(() => expect(onSessionChange).toHaveBeenCalledWith(runningSession));
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });
});

describe("what the exam will ask", () => {
  test("an unpooled bank says the set does not change; a pooled one says it does", async () => {
    renderMode();
    expect(await screen.findByText(/All 3, every attempt/)).toBeInTheDocument();
    expect(screen.getByText("Domains in this exam")).toBeInTheDocument();
  });

  test("a pooled bank names the draw and the pool it comes from", async () => {
    exam = { ...ckad, questionCount: 2 };
    renderMode();
    expect(await screen.findByText(/2 drawn at random from 3/)).toBeInTheDocument();
    expect(screen.getByText("Domains in the pool")).toBeInTheDocument();
  });

  test("every domain is listed with how many questions it holds", async () => {
    renderMode();
    await screen.findByText("Application Design and Build");

    const design = screen.getByText("Application Design and Build").closest("li") as HTMLElement;
    expect(design.textContent).toContain("2");
    const net = screen.getByText("Services and Networking").closest("li") as HTMLElement;
    expect(net.textContent).toContain("1");
  });
});

// A stale bookmark, or a switch that failed after this screen was
// queued. Every card here would start the OTHER exam, so the screen must
// leave rather than render a single one of them.
describe("a route that names an exam the server does not have", () => {
  test("goes back to the selector and shows no way to start", async () => {
    renderMode(() => {}, "kcna-mock");

    await waitFor(() => expect(window.location.hash).toBe("#/exams"));
    expect(screen.queryByRole("heading", { name: "Training" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Start/ })).not.toBeInTheDocument();
  });
});
