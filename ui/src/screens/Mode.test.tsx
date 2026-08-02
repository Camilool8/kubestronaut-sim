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
  // The bank's DECLARED curriculum, which is what the chips are built
  // from. Deliberately not a rollup of `questions`: once an attempt has
  // drawn its subset, `questions` is that subset, and the two lists are
  // different here so a test that confused them would fail.
  domains: [
    { name: "Application Design and Build", weightPct: 20, questionCount: 8 },
    { name: "Services and Networking", weightPct: 20, questionCount: 5 },
    { name: "Observability", weightPct: 15, questionCount: 4 },
  ],
  modes,
};

// A bank whose `questions` and declared curriculum agree, for the tests
// that count the draw rather than pin where the chips come from: 10
// Design and Build, 6 Services and Networking, 4 Observability.
const twentyQuestions: Pick<ExamInfo, "questions" | "domains"> = {
  questions: [
    ...Array.from({ length: 10 }, (_, i) =>
      question(`d${i}`, "Application Design and Build"),
    ),
    ...Array.from({ length: 6 }, (_, i) => question(`s${i}`, "Services and Networking")),
    ...Array.from({ length: 4 }, (_, i) => question(`o${i}`, "Observability")),
  ],
  domains: [
    { name: "Application Design and Build", weightPct: 50, questionCount: 10 },
    { name: "Services and Networking", weightPct: 30, questionCount: 6 },
    { name: "Observability", weightPct: 20, questionCount: 4 },
  ],
};

let exam: ExamInfo = ckad;
let startStatus = 200;
let startCalls: string[] = [];
// The whole body, not just the mode: a filtered draw is the difference
// between `{mode}` and `{mode, domains}`, and only the second is visible
// here.
let startBodies: { mode: string; domains?: string[] }[] = [];
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
        const body = JSON.parse(String(init.body)) as { mode: string; domains?: string[] };
        startBodies.push(body);
        startCalls.push(body.mode);
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
  startBodies = [];
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
  });

  test("a pooled bank names the draw and the pool it comes from", async () => {
    exam = { ...ckad, questionCount: 2 };
    renderMode();
    expect(await screen.findByText(/2 drawn at random from 3/)).toBeInTheDocument();
  });

  // The one number this panel can get wrong invisibly. `questions` is the
  // DRAWN subset once an attempt exists, so counting it would advertise
  // the last draw as the curriculum — the doc comment on ExamInfo.domains
  // exists for this. The fixture's two lists disagree on purpose.
  test("the chips come from the declared curriculum, not from the drawn questions", async () => {
    renderMode();
    const chip = await screen.findByRole("button", { name: /Application Design and Build/ });

    expect(chip.textContent).toContain("8");
    expect(chip.textContent).not.toContain("2");
    // A domain with no drawn question still has to be offerable.
    expect(screen.getByRole("button", { name: /Observability/ })).toBeInTheDocument();
  });

  // The bank predates GET /api/exam's `domains`. There is nothing honest
  // to filter on, so nothing is drawn as a control — a chip that looks
  // clickable and is not is worse than a plain tag.
  test("a bank that declares no domains falls back to read-only tags", async () => {
    exam = { ...ckad, domains: undefined };
    renderMode();
    await screen.findByText("Domains in this exam");

    expect(
      screen.queryByRole("group", { name: "Curriculum domains to draw from" }),
    ).not.toBeInTheDocument();
    const design = screen.getByText("Application Design and Build").closest("li") as HTMLElement;
    expect(design.textContent).toContain("2");
  });
});

describe("narrowing the draw", () => {
  test("with nothing chosen it starts a full-curriculum attempt", async () => {
    const user = userEvent.setup();
    renderMode();
    await screen.findByRole("heading", { name: "Exam" });

    expect(screen.getByRole("button", { name: "All domains" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Start Exam" }));
    // The bare-mode form: no `domains` key at all, which is what every
    // other caller of POST /api/session/start sends.
    await waitFor(() => expect(startBodies).toEqual([{ mode: "exam" }]));
  });

  test("choosing domains sends them, and says the run will not be a pass", async () => {
    const user = userEvent.setup();
    renderMode();
    await user.click(await screen.findByRole("button", { name: /Services and Networking/ }));

    // Said before the attempt starts, not after the result lands.
    expect(screen.getByText(/never reported as a pass/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All domains" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    // The verb changes at the point of the act, because the chips are
    // further down the page than the button is.
    await user.click(screen.getByRole("button", { name: "Start Exam drill" }));
    await waitFor(() =>
      expect(startBodies).toEqual([{ mode: "exam", domains: ["Services and Networking"] }]),
    );
  });

  // Found in the browser: the panel kept saying "All 22, every attempt"
  // beside a chip row that had just narrowed the draw to four. Of
  // everything on this screen, the number of questions is the one claim a
  // candidate carries into the exam with them.
  test("the summary counts the narrowed draw, not the whole bank", async () => {
    const user = userEvent.setup();
    // A self-consistent bank: 20 authored questions, and the declared
    // curriculum accounts for all 20. `ckad` above deliberately makes the
    // two lists disagree, which is right for the tests that pin WHICH
    // list the chips come from and wrong for one that counts them.
    exam = { ...ckad, ...twentyQuestions, questionCount: 20 };
    renderMode();
    expect(await screen.findByText(/All 20, every attempt/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Services and Networking/ }));
    expect(screen.getByText("6 of 20, from the domain you picked.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Observability/ }));
    expect(screen.getByText("10 of 20, from the 2 domains you picked.")).toBeInTheDocument();
  });

  // The bank's own length still caps a filtered draw, exactly as
  // exam.Draw does: a pooled bank asked for 8 does not hand back 10
  // because the chips happened to select 10.
  test("a pooled bank's declared length still caps the narrowed draw", async () => {
    const user = userEvent.setup();
    exam = { ...ckad, ...twentyQuestions, questionCount: 8 };
    renderMode();

    await user.click(await screen.findByRole("button", { name: /Services and Networking/ }));
    await user.click(screen.getByRole("button", { name: /Observability/ }));
    expect(screen.getByText("8 of 20, from the 2 domains you picked.")).toBeInTheDocument();
  });

  test("the All domains chip clears a filter that was already set", async () => {
    const user = userEvent.setup();
    renderMode();
    await user.click(await screen.findByRole("button", { name: /Observability/ }));
    await user.click(screen.getByRole("button", { name: "All domains" }));

    expect(screen.queryByText(/never reported as a pass/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start Exam" }));
    await waitFor(() => expect(startBodies).toEqual([{ mode: "exam" }]));
  });
});

// "Build a drill from these" on the dashboard lands here with the weak
// domains in the fragment.
describe("a drill deep link", () => {
  test("preselects the domains the route names", async () => {
    window.location.hash = "#/exams/ckad-mock-01/mode?domain=Observability";
    const user = userEvent.setup();
    renderMode();

    const chip = await screen.findByRole("button", { name: /Observability/ });
    expect(chip).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Start Exam drill" }));
    await waitFor(() =>
      expect(startBodies).toEqual([{ mode: "exam", domains: ["Observability"] }]),
    );
  });

  // A domain name is free text from the bank and CKAD ships one with a
  // comma in it. Packed into a single comma-joined parameter it would
  // arrive here already split in two, and the server would be asked to
  // draw from domains that do not exist — which is why the preselection
  // travels as a repeated key.
  test("a domain name containing a comma survives the round trip", async () => {
    exam = {
      ...ckad,
      domains: [{ name: "Config, Security", weightPct: 25, questionCount: 6 }],
    };
    const params = new URLSearchParams();
    params.append("domain", "Config, Security");
    window.location.hash = `#/exams/ckad-mock-01/mode?${params.toString()}`;
    const user = userEvent.setup();
    renderMode();

    await user.click(await screen.findByRole("button", { name: "Start Exam drill" }));
    await waitFor(() =>
      expect(startBodies).toEqual([{ mode: "exam", domains: ["Config, Security"] }]),
    );
  });

  // A bookmark from before a bank switch, or a link shared between two
  // certifications. A name the loaded bank has never heard of must not
  // reach the server as a filter: it would narrow the draw to nothing.
  test("a domain this bank does not have is dropped rather than sent", async () => {
    window.location.hash =
      "#/exams/ckad-mock-01/mode?domain=Observability&domain=Cluster+Setup";
    const user = userEvent.setup();
    renderMode();

    await user.click(await screen.findByRole("button", { name: "Start Exam drill" }));
    await waitFor(() =>
      expect(startBodies).toEqual([{ mode: "exam", domains: ["Observability"] }]),
    );
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
