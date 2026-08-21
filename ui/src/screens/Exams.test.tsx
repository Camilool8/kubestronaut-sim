import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Exams } from "./Exams";
import type { CatalogResponse, ExamProgress } from "../api";
import { NARROW_QUERY } from "../lib/useMediaQuery";
import { TOUCH_ONLY_QUERY } from "../lib/deviceCapability";
import { matchMediaMock } from "../test/setup";

const untouched: ExamProgress = { attempts: 0, counted: 0, passed: false, weakDomains: [] };

const ckad = {
  id: "ckad-mock-01",
  title: "CKAD Mock Exam 01",
  certification: "CKAD",
  description: "Twenty-two hands-on tasks in the real exam's shape.",
  examType: "hands-on",
  durationSeconds: 7200,
  passingScore: 66,
  questionCount: 22,
  poolCount: 22,
  available: true,
  progress: untouched,
};

const kcna = {
  id: "kcna-mock",
  title: "KCNA Mock Exam",
  certification: "KCNA",
  examType: "mcq",
  durationSeconds: 5400,
  passingScore: 75,
  questionCount: 65,
  poolCount: 97,
  available: true,
  progress: untouched,
};

const cks = {
  id: "cks-mock",
  title: "CKS Mock Exam",
  certification: "CKS",
  examType: "hands-on",
  available: false,
  comingSoon: true,
  note: "Requires security add-ons not in the kind environment yet",
  progress: untouched,
};

const catalog = (
  active: string,
  exams = [ckad, kcna, cks],
  summary: Partial<CatalogResponse["summary"]> = {},
): CatalogResponse =>
  ({
    active,
    exams,
    summary: { attempts: 0, passedCount: 0, trackCount: 5, weakDomains: [], ...summary },
  }) as CatalogResponse;

let banks: CatalogResponse = catalog("ckad-mock-01");
let switchCalls: string[] = [];

function mockApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/catalog")) {
        return new Response(JSON.stringify(banks), { status: 200 });
      }
      if (url.endsWith("/api/control/switch") && init?.method === "POST") {
        switchCalls.push(JSON.parse(String(init.body)).bank);
        return new Response(JSON.stringify({ job: { id: "job-1" } }), { status: 202 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

const noop = () => {};
const renderExams = (
  catalogVersion = 0,
  onControlStart = noop as never,
  seatKind?: "practical" | "mcq",
  seatBank?: string,
) =>
  render(
    <Exams
      catalogVersion={catalogVersion}
      onControlStart={onControlStart}
      seatKind={seatKind}
      seatBank={seatBank}
      onBanksLoaded={noop}
    />,
  );

const cardFor = (heading: string) =>
  screen.getByRole("heading", { name: heading }).closest("article") as HTMLElement;

beforeEach(() => {
  banks = catalog("ckad-mock-01");
  switchCalls = [];
  window.history.replaceState(null, "", window.location.pathname);
  mockApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", window.location.pathname);
});

describe("the catalog", () => {
  test("renders every exam, live ones first, with their real numbers", async () => {
    renderExams();
    await screen.findByRole("heading", { name: "CKAD" });

    const ckadCard = cardFor("CKAD");
    expect(within(ckadCard).getByText("Certified Kubernetes Application Developer")).toBeInTheDocument();
    expect(within(ckadCard).getByText("2h")).toBeInTheDocument();
    expect(within(ckadCard).getByText("66%")).toBeInTheDocument();
    expect(within(ckadCard).getByText("Practical")).toBeInTheDocument();

    expect(within(ckadCard).getByText("Live")).toBeInTheDocument();
    expect(within(cardFor("CKS")).getByText("Soon")).toBeInTheDocument();
  });

  test("a pooled exam shows the draw and the pool; an unpooled one shows one number", async () => {
    renderExams();
    await screen.findByRole("heading", { name: "KCNA" });
    const kcnaCard = cardFor("KCNA");

    expect(within(kcnaCard).getByText("Drawn / pool")).toBeInTheDocument();
    expect(within(kcnaCard).getByText("/ 97")).toBeInTheDocument();

    const ckadCard = cardFor("CKAD");
    expect(within(ckadCard).getByText("Tasks")).toBeInTheDocument();
    expect(within(ckadCard).queryByText(/^\/ /)).not.toBeInTheDocument();
  });

  test("a coming-soon exam gives its reason and offers no way in", async () => {
    renderExams();
    await screen.findByRole("heading", { name: "CKS" });
    const card = cardFor("CKS");

    expect(
      within(card).getByText("Requires security add-ons not in the kind environment yet"),
    ).toBeInTheDocument();
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });

  test("the capsule counts certifications passed, out of the whole path", async () => {
    banks = catalog("ckad-mock-01", [ckad, kcna, cks], { passedCount: 1, trackCount: 5 });
    renderExams();
    expect(await screen.findByText("1 of 5 passed")).toBeInTheDocument();
    expect(screen.getByText("Progress")).toBeInTheDocument();
  });

  test("an exam with no attempts keeps its description instead of an empty bar", async () => {
    renderExams();
    await screen.findByRole("heading", { name: "CKAD" });
    const card = cardFor("CKAD");

    expect(
      within(card).getByText("Twenty-two hands-on tasks in the real exam's shape."),
    ).toBeInTheDocument();
    expect(within(card).queryByText(/Best attempt/)).not.toBeInTheDocument();
  });

  test("an exam with counted attempts shows its best score in place of the pitch", async () => {
    banks = catalog("ckad-mock-01", [
      {
        ...ckad,
        progress: { attempts: 3, counted: 3, bestPercent: 71, passed: false, weakDomains: [] },
      },
      kcna,
      cks,
    ]);
    renderExams();
    await screen.findByRole("heading", { name: "CKAD" });
    const card = cardFor("CKAD");

    expect(within(card).getByText("Best attempt · 3 sessions")).toBeInTheDocument();
    expect(card.querySelector(".exam-attempts-figure")?.textContent).toBe("71%");

    expect(within(card).queryByText(/Twenty-two hands-on tasks/)).not.toBeInTheDocument();
  });

  test("attempts that none of them counted show as drills with no best score", async () => {
    banks = catalog("ckad-mock-01", [
      { ...ckad, progress: { attempts: 4, counted: 0, passed: false, weakDomains: [] } },
      kcna,
      cks,
    ]);
    renderExams();
    await screen.findByRole("heading", { name: "CKAD" });
    const card = cardFor("CKAD");

    expect(within(card).getByText("4 drills · none counted")).toBeInTheDocument();

    expect(card.querySelector(".exam-attempts-figure")?.textContent).toBe("—");
  });

  test("reports the catalog up in the shape App reads", async () => {
    const onBanksLoaded = vi.fn();
    render(
      <Exams catalogVersion={0} onControlStart={noop as never} onBanksLoaded={onBanksLoaded} />,
    );
    await screen.findByRole("heading", { name: "CKAD" });

    await waitFor(() =>
      expect(onBanksLoaded).toHaveBeenCalledWith(
        expect.objectContaining({ active: "ckad-mock-01" }),
      ),
    );
    const reported = onBanksLoaded.mock.calls[0][0] as { banks: { id: string }[] };
    expect(reported.banks.map((b) => b.id)).toEqual(["ckad-mock-01", "kcna-mock", "cks-mock"]);
  });

  test("says so when the catalog is empty, rather than rendering a bare page", async () => {
    banks = catalog("", []);
    renderExams();
    expect(await screen.findByText(/no exams are installed/i)).toBeInTheDocument();
  });

  test("refetches when catalogVersion changes", async () => {
    const { rerender } = renderExams();
    await screen.findByRole("heading", { name: "CKAD" });

    banks = catalog("kcna-mock", [kcna]);
    rerender(
      <Exams catalogVersion={1} onControlStart={noop as never} onBanksLoaded={noop} />,
    );
    await waitFor(() => expect(screen.queryByRole("heading", { name: "CKAD" })).toBeNull());
    expect(screen.getByRole("heading", { name: "KCNA" })).toBeInTheDocument();
  });
});

describe("choosing an exam", () => {
  test("the loaded exam goes straight to its modes", async () => {
    const user = userEvent.setup();
    renderExams();
    await screen.findByRole("heading", { name: "CKAD" });

    await user.click(within(cardFor("CKAD")).getByRole("button", { name: "Choose a mode" }));
    expect(window.location.hash).toBe("#/exams/ckad-mock-01/mode");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("any other exam is a confirmed rebuild, not a navigation", async () => {
    const user = userEvent.setup();
    renderExams(0, ((start: () => Promise<unknown>) => void start()) as never);
    await screen.findByRole("heading", { name: "KCNA" });

    await user.click(within(cardFor("KCNA")).getByRole("button", { name: "Choose a mode" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    expect(switchCalls).toEqual([]);
    expect(window.location.hash).toBe("");

    await user.click(screen.getByRole("button", { name: "Load it" }));
    await waitFor(() => expect(switchCalls).toEqual(["kcna-mock"]));

    expect(window.location.hash).toBe("");
  });

  describe("with no exam loaded yet", () => {
    beforeEach(() => {
      banks = catalog("");
    });

    test("confirms a build rather than a destructive switch", async () => {
      const user = userEvent.setup();
      renderExams(0, ((start: () => Promise<unknown>) => void start()) as never);
      await screen.findByRole("heading", { name: "CKAD" });

      await user.click(within(cardFor("CKAD")).getByRole("button", { name: "Choose a mode" }));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).not.toHaveTextContent(/wipes/i);
      expect(dialog).not.toHaveTextContent(/switching/i);
      expect(dialog).toHaveTextContent(/builds the Kubernetes cluster/i);

      await user.click(screen.getByRole("button", { name: "Build it" }));
      await waitFor(() => expect(switchCalls).toEqual(["ckad-mock-01"]));
    });

    test("still gates it behind a confirmation — it is minutes of work", async () => {
      const user = userEvent.setup();
      renderExams(0, ((start: () => Promise<unknown>) => void start()) as never);
      await screen.findByRole("heading", { name: "CKAD" });

      await user.click(within(cardFor("CKAD")).getByRole("button", { name: "Choose a mode" }));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(switchCalls).toEqual([]);
      expect(window.location.hash).toBe("");
    });
  });

  test("cancelling starts nothing", async () => {
    const user = userEvent.setup();
    renderExams(0, ((start: () => Promise<unknown>) => void start()) as never);
    await screen.findByRole("heading", { name: "KCNA" });

    await user.click(within(cardFor("KCNA")).getByRole("button", { name: "Choose a mode" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(switchCalls).toEqual([]);
  });

  test("once the rebuild lands, it opens the modes it was started for", async () => {
    const user = userEvent.setup();
    const { rerender } = renderExams(
      0,
      ((start: () => Promise<unknown>) => void start()) as never,
    );
    await screen.findByRole("heading", { name: "KCNA" });
    await user.click(within(cardFor("KCNA")).getByRole("button", { name: "Choose a mode" }));
    await user.click(await screen.findByRole("button", { name: "Load it" }));
    await waitFor(() => expect(switchCalls).toEqual(["kcna-mock"]));

    banks = catalog("kcna-mock");
    rerender(
      <Exams
        catalogVersion={1}
        onControlStart={((start: () => Promise<unknown>) => void start()) as never}
        onBanksLoaded={noop}
      />,
    );

    await waitFor(() => expect(window.location.hash).toBe("#/exams/kcna-mock/mode"));
  });

  test("a rebuild that never changes the active exam navigates nowhere", async () => {
    const user = userEvent.setup();
    const { rerender } = renderExams(
      0,
      ((start: () => Promise<unknown>) => void start()) as never,
    );
    await screen.findByRole("heading", { name: "KCNA" });
    await user.click(within(cardFor("KCNA")).getByRole("button", { name: "Choose a mode" }));
    await user.click(await screen.findByRole("button", { name: "Load it" }));
    await waitFor(() => expect(switchCalls).toEqual(["kcna-mock"]));

    rerender(
      <Exams
        catalogVersion={1}
        onControlStart={((start: () => Promise<unknown>) => void start()) as never}
        onBanksLoaded={noop}
      />,
    );
    await waitFor(() => expect(screen.getByRole("heading", { name: "CKAD" })).toBeInTheDocument());
    expect(window.location.hash).toBe("");
  });
});

describe("a hosted seat", () => {
  test("offers only the exams that seat can actually run", async () => {
    renderExams(0, noop as never, "mcq");
    await screen.findByRole("heading", { name: "KCNA" });

    expect(within(cardFor("KCNA")).getByRole("button", { name: "Choose a mode" })).toBeTruthy();
    expect(within(cardFor("CKAD")).queryByRole("button")).toBeNull();
  });

  test("says which seat a hands-on exam needs, rather than calling it unavailable", async () => {
    renderExams(0, noop as never, "mcq");
    await screen.findByRole("heading", { name: "CKAD" });

    const card = cardFor("CKAD");
    expect(within(card).getByText("Not in this seat")).toBeTruthy();
    expect(within(card).getByText(/end this session and start a practical one/i)).toBeTruthy();
  });

  test("the mirror: a hands-on seat is not offered the question bank", async () => {
    renderExams(0, noop as never, "practical");
    await screen.findByRole("heading", { name: "CKAD" });

    expect(within(cardFor("CKAD")).getByRole("button", { name: "Choose a mode" })).toBeTruthy();
    expect(within(cardFor("KCNA")).queryByRole("button")).toBeNull();
  });

  test("changes nothing locally, where there is no seat and every exam is yours", async () => {
    renderExams();
    await screen.findByRole("heading", { name: "CKAD" });

    expect(within(cardFor("CKAD")).getByRole("button", { name: "Choose a mode" })).toBeTruthy();
    expect(within(cardFor("KCNA")).getByRole("button", { name: "Choose a mode" })).toBeTruthy();
  });

  test("a seat offers its own exam and no other, even of the same engine", async () => {
    banks = catalog("ckad-mock-01", [ckad, { ...kcna, examType: "hands-on" }, cks]);
    renderExams(0, noop as never, "practical", "ckad-mock-01");
    await screen.findByRole("heading", { name: "CKAD" });

    expect(within(cardFor("CKAD")).getByRole("button", { name: "Choose a mode" })).toBeTruthy();
    const other = cardFor("KCNA");
    expect(within(other).queryByRole("button")).toBeNull();
    expect(within(other).getByText("Not in this seat")).toBeTruthy();

    expect(within(other).getByText(/end the session and start this exam/i)).toBeTruthy();
  });

  test("a seat that records no exam still refuses the wrong engine", async () => {
    renderExams(0, noop as never, "mcq", undefined);
    await screen.findByRole("heading", { name: "CKAD" });

    expect(within(cardFor("CKAD")).getByText("Not in this seat")).toBeTruthy();
    expect(within(cardFor("KCNA")).getByRole("button", { name: "Choose a mode" })).toBeTruthy();
  });
});

describe("a device that cannot sit a hands-on exam", () => {
  afterEach(() => {
    matchMediaMock([]);
  });

  test("the hands-on card loses its button and says why", async () => {
    matchMediaMock([TOUCH_ONLY_QUERY]);
    renderExams();
    await screen.findByRole("heading", { name: "CKAD" });

    const card = cardFor("CKAD");
    expect(within(card).queryByRole("button")).toBeNull();
    expect(within(card).getByText(/needs a keyboard and a desktop browser/i)).toBeTruthy();
  });

  test("the question bank is untouched — it is why a phone is here", async () => {
    matchMediaMock([TOUCH_ONLY_QUERY]);
    renderExams();
    await screen.findByRole("heading", { name: "KCNA" });

    expect(within(cardFor("KCNA")).getByRole("button", { name: "Choose a mode" })).toBeTruthy();
  });

  test("a narrowed desktop window is not refused", async () => {
    matchMediaMock([NARROW_QUERY]);
    renderExams();
    await screen.findByRole("heading", { name: "CKAD" });

    expect(within(cardFor("CKAD")).getByRole("button", { name: "Choose a mode" })).toBeTruthy();
  });

  test("the seat's reason wins over the device's", async () => {
    matchMediaMock([TOUCH_ONLY_QUERY]);
    renderExams(0, noop as never, "mcq");
    await screen.findByRole("heading", { name: "CKAD" });

    expect(within(cardFor("CKAD")).getByText("Not in this seat")).toBeTruthy();
  });
});
