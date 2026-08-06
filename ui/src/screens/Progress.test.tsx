import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Progress } from "./Progress";
import type {
  AttemptRecord,
  CatalogExam,
  CatalogResponse,
  ExamInfo,
  HistoryResponse,
} from "../api";

const noProgress = { attempts: 0, counted: 0, passed: false, weakDomains: [] };

const exams: CatalogExam[] = [
  {
    id: "kcna-mock",
    title: "KCNA Mock Exam",
    certification: "KCNA",
    examType: "mcq",
    available: true,
    progress: {
      attempts: 2,
      counted: 2,
      bestPercent: 88,
      passed: true,
      lastAttemptAt: "2026-03-12T09:00:00Z",
      weakDomains: [],
    },
  },
  {
    id: "ckad-mock-01",
    title: "CKAD Mock Exam 01",
    certification: "CKAD",
    examType: "hands-on",
    available: true,
    progress: {
      attempts: 3,
      counted: 2,
      bestPercent: 74,
      passed: false,
      lastAttemptAt: "2026-08-01T12:00:00Z",
      weakDomains: [],
    },
  },
  {
    id: "cks-mock",
    title: "CKS Mock Exam",
    certification: "CKS",
    examType: "hands-on",
    available: false,
    comingSoon: true,
    progress: noProgress,
  },
];

const sitting: AttemptRecord = {
  id: "a1",
  bank: "ckad-mock-01",
  certification: "CKAD",
  examTitle: "CKAD Mock Exam 01",
  examType: "hands-on",
  mode: "speed",
  startedAt: "2026-08-01T11:00:00Z",
  gradedAt: "2026-08-01T12:00:00Z",
  durationSeconds: 3600,
  elapsedSeconds: 2592,
  questionCount: 22,
  earned: 60,
  total: 81,
  percent: 74,
  passingScore: 66,
  passed: true,
  counted: true,
};

const drill: AttemptRecord = {
  id: "a2",
  bank: "ckad-mock-01",
  certification: "CKAD",
  examType: "hands-on",
  mode: "training",
  startedAt: "2026-07-28T09:00:00Z",
  gradedAt: "2026-07-28T10:12:00Z",
  elapsedSeconds: 4320,
  questionCount: 4,
  earned: 4,
  total: 4,
  percent: 100,
  passingScore: 66,
  passed: true,
  counted: false,
  domainFilter: ["Services and Networking"],
};

const summary = {
  attempts: 2,
  passedCount: 1,
  trackCount: 5,
  weakDomains: [
    { domain: "Services and Networking", earned: 6, total: 14, percent: 42, attempts: 3 },
    { domain: "Observability", earned: 8, total: 12, percent: 67, attempts: 2 },
  ],
};

const ckadExam: ExamInfo = {
  name: "ckad-mock-01",
  title: "CKAD Mock Exam 01",
  certification: "CKAD",
  examType: "hands-on",
  durationSeconds: 7200,
  passingScore: 66,
  kubernetesVersion: "1.35",
  questionCount: 22,
  questions: [],
  domains: [
    { name: "Services and Networking", weightPct: 20, questionCount: 5 },
    { name: "Observability", weightPct: 15, questionCount: 4 },
  ],
};

let catalog: CatalogResponse;
let history: HistoryResponse;
let exam: ExamInfo | null;
let examStatus: number;
let deleteCalls: number;
let importBodies: string[];
let importStatus: number;

function mockApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status });

      if (url.endsWith("/api/catalog")) return json(catalog);
      if (url.endsWith("/api/history/import") && init?.method === "POST") {
        importBodies.push(String(init.body));
        if (importStatus !== 200) return json({ error: "not an export document" }, importStatus);
        return json({ imported: 3, skipped: 1 });
      }
      if (url.endsWith("/api/history") && init?.method === "DELETE") {
        deleteCalls++;
        history = { attempts: [], summary: { ...summary, attempts: 0, weakDomains: [] } };
        return json({});
      }
      if (url.endsWith("/api/history")) return json(history);
      if (url.endsWith("/api/exam")) {
        return examStatus === 200 ? json(exam) : json({ error: "still building" }, examStatus);
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

const renderProgress = () => render(<Progress catalogVersion={0} />);

const cardFor = (id: string) =>
  screen.getByText(id, { selector: ".path-card-id" }).closest("article") as HTMLElement;

const rowFor = (mode: string) => screen.getByText(mode).closest("tr") as HTMLElement;

beforeEach(() => {
  catalog = { active: "ckad-mock-01", exams, summary };
  history = { attempts: [sitting, drill], summary };
  exam = ckadExam;
  examStatus = 200;
  deleteCalls = 0;
  importBodies = [];
  importStatus = 200;
  window.history.replaceState(null, "", window.location.pathname);
  window.location.hash = "";
  mockApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", window.location.pathname);
});

describe("the certification path", () => {
  test("one card per exam, each saying which of the four states it is in", async () => {
    renderProgress();
    await screen.findByText("KCNA", { selector: ".path-card-id" });

    expect(within(cardFor("KCNA")).getByText("Passed")).toBeInTheDocument();
    expect(within(cardFor("CKAD")).getByText("In progress")).toBeInTheDocument();
    expect(within(cardFor("CKS")).getByText("Not built")).toBeInTheDocument();

    expect(within(cardFor("KCNA")).getByText("88%")).toBeInTheDocument();
    expect(within(cardFor("KCNA")).getByText("2 attempts · 12 Mar 2026")).toBeInTheDocument();
    expect(within(cardFor("CKS")).getByText("No attempts yet")).toBeInTheDocument();
  });

  test("a card with only uncounted attempts shows no best score", async () => {
    catalog = {
      ...catalog,
      exams: [
        { ...exams[1], progress: { attempts: 4, counted: 0, passed: false, weakDomains: [] } },
      ],
    };
    renderProgress();
    await screen.findByText("CKAD", { selector: ".path-card-id" });
    const card = cardFor("CKAD");

    expect(within(card).getByText("4 drills · none counted")).toBeInTheDocument();
    expect(card.querySelector(".path-card-score")?.textContent).toContain("—");
    expect(within(card).getByText("In progress")).toBeInTheDocument();
  });
});

describe("the attempt table", () => {
  test("lists every graded attempt with how it was run and what it drew from", async () => {
    renderProgress();
    await screen.findByRole("table");

    const full = rowFor("Mastery · all domains");
    expect(within(full).getByText("CKAD")).toBeInTheDocument();
    expect(within(full).getByText("1 Aug 2026")).toBeInTheDocument();
    expect(within(full).getByText("43m 12s")).toBeInTheDocument();
    expect(within(full).getByText("74%")).toBeInTheDocument();
    expect(within(full).getByText("pass")).toBeInTheDocument();
  });

  test("an uncounted attempt is listed, keeps its score, and is marked as a drill", async () => {
    renderProgress();
    await screen.findByRole("table");

    const row = rowFor("Training · Services and Networking");
    expect(within(row).getByText("100%")).toBeInTheDocument();
    expect(within(row).getByText("drill")).toBeInTheDocument();

    expect(within(row).queryByText("pass")).not.toBeInTheDocument();
    expect(
      screen.getByText(/does not count toward the path/),
    ).toBeInTheDocument();
  });

  test("says what to do rather than showing an empty table when nothing is graded", async () => {
    history = { attempts: [], summary: { ...summary, attempts: 0, weakDomains: [] } };
    catalog = { ...catalog, summary: { ...summary, attempts: 0, weakDomains: [] } };
    renderProgress();

    expect(await screen.findByText(/Nothing graded yet/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Nothing to rank yet.")).toBeInTheDocument();

    expect(screen.getByText("KCNA", { selector: ".path-card-id" })).toBeInTheDocument();
  });
});

describe("the weak-domain panel", () => {
  test("ranks domains weakest first and says how many attempts each rests on", async () => {
    renderProgress();
    await screen.findByText("Services and Networking", { selector: ".weak-name" });

    const rows = screen.getAllByText(/%$/, { selector: ".weak-figure" });
    expect(rows.map((r) => r.textContent)).toEqual(["42%", "67%"]);

    expect(screen.getByText("from 3 attempts")).toBeInTheDocument();
  });

  test("the drill button carries the drillable domains into the mode screen", async () => {
    const user = userEvent.setup();
    renderProgress();

    await user.click(await screen.findByRole("button", { name: "Build a drill from these" }));

    expect(window.location.hash).toBe(
      "#/exams/ckad-mock-01/mode?domain=Services+and+Networking&domain=Observability",
    );
  });

  test("counts what the drill will take when the list spans certifications", async () => {
    history = {
      ...history,
      summary: {
        ...summary,
        weakDomains: [
          ...summary.weakDomains,
          { domain: "Cloud Native Architecture", earned: 3, total: 9, percent: 33, attempts: 1 },
        ],
      },
    };
    const user = userEvent.setup();
    renderProgress();

    expect(await screen.findByText("not in the loaded exam")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Build a drill from 2 of these" }));
    expect(window.location.hash).toBe(
      "#/exams/ckad-mock-01/mode?domain=Services+and+Networking&domain=Observability",
    );
  });

  test("ranks at most six domains", async () => {
    history = {
      ...history,
      summary: {
        ...summary,
        weakDomains: Array.from({ length: 9 }, (_, i) => ({
          domain: `Domain ${i}`,
          earned: i,
          total: 10,
          percent: i * 10,
          attempts: 2,
        })),
      },
    };
    renderProgress();

    await screen.findByText("Domain 0", { selector: ".weak-name" });
    expect(document.querySelectorAll(".weak-row")).toHaveLength(6);
    expect(screen.queryByText("Domain 6")).not.toBeInTheDocument();
  });

  test("says why instead of offering a drill for another certification's domains", async () => {
    catalog = { ...catalog, active: "kcna-mock" };
    exam = { ...ckadExam, name: "kcna-mock", domains: [{ name: "Cloud Native Architecture", weightPct: 16, questionCount: 9 }] };
    renderProgress();

    expect(
      await screen.findByText(/These domains come from other exams. Load KCNA to drill them./),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Build a drill from these" }),
    ).not.toBeInTheDocument();
  });

  test("offers neither button nor excuse when the loaded exam is unknown", async () => {
    examStatus = 503;
    renderProgress();
    await screen.findByText("Services and Networking", { selector: ".weak-name" });

    expect(
      screen.queryByRole("button", { name: "Build a drill from these" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Load .* to drill them/)).not.toBeInTheDocument();
  });
});

describe("the record itself", () => {
  test("erasing is confirmed first, and nothing is deleted by the dialog opening", async () => {
    const user = userEvent.setup();
    renderProgress();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Erase history" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    expect(deleteCalls).toBe(0);
    expect(screen.getByText(/There is no undo/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(deleteCalls).toBe(0);
  });

  test("confirming erases the record and the screen refetches what is left", async () => {
    const user = userEvent.setup();
    renderProgress();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Erase history" }));
    await user.click(await screen.findByRole("button", { name: "Erase everything" }));

    await waitFor(() => expect(deleteCalls).toBe(1));
    expect(await screen.findByText("History erased.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("table")).not.toBeInTheDocument());
  });

  test("importing a document merges it and reports what happened to it", async () => {
    const user = userEvent.setup();
    const { container } = renderProgress();
    await screen.findByRole("table");

    const picker = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(picker, new File(['{"attempts":[]}'], "history.json", {
      type: "application/json",
    }));

    await waitFor(() => expect(importBodies).toEqual(['{"attempts":[]}']));
    expect(await screen.findByText("Imported 3; 1 were already here.")).toBeInTheDocument();
  });

  test("a rejected import says so and leaves the record alone", async () => {
    const user = userEvent.setup();
    importStatus = 400;
    const { container } = renderProgress();
    await screen.findByRole("table");

    const picker = container.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(picker, new File(["not an export"], "notes.json", {
      type: "application/json",
    }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not an export document/);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  test("export is a link the browser saves, not a button that builds a blob", async () => {
    renderProgress();
    const link = await screen.findByRole("link", { name: "Export" });

    expect(link).toHaveAttribute("href", "/api/history/export");
    expect(link).toHaveAttribute("download");
  });
});
