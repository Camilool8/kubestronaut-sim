import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Exams } from "./Exams";
import type { BanksResponse } from "../api";

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
};

// Pooled: the two counts differ, which is the only case the card prints
// them as a pair.
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
};

const cks = {
  id: "cks-mock",
  title: "CKS Mock Exam",
  certification: "CKS",
  examType: "hands-on",
  available: false,
  comingSoon: true,
  note: "Requires security add-ons not in the kind environment yet",
};

const catalog = (active: string, banks = [ckad, kcna, cks]): BanksResponse =>
  ({ active, banks }) as BanksResponse;

let banks: BanksResponse = catalog("ckad-mock-01");
let switchCalls: string[] = [];

function mockApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/control/banks")) {
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
const renderExams = (catalogVersion = 0, onControlStart = noop as never) =>
  render(
    <Exams
      catalogVersion={catalogVersion}
      onControlStart={onControlStart}
      onBanksLoaded={noop}
    />,
  );

/** The card whose heading is this exam, so a query can never drift cards. */
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

    // A live exam and a coming-soon one must be told apart by more than
    // a colour: each says which it is.
    expect(within(ckadCard).getByText("Live")).toBeInTheDocument();
    expect(within(cardFor("CKS")).getByText("Soon")).toBeInTheDocument();
  });

  // The one number this screen can get wrong in a way nobody would
  // notice: a 97-question pool advertising itself as 65.
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

  // The reason an exam cannot be sat is the entire point of listing it.
  test("a coming-soon exam gives its reason and offers no way in", async () => {
    renderExams();
    await screen.findByRole("heading", { name: "CKS" });
    const card = cardFor("CKS");

    expect(
      within(card).getByText("Requires security add-ons not in the kind environment yet"),
    ).toBeInTheDocument();
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });

  test("says so when the catalog is empty, rather than rendering a bare page", async () => {
    banks = catalog("", []);
    renderExams();
    expect(await screen.findByText(/no exams are installed/i)).toBeInTheDocument();
  });

  // A completed switch job changes the active bank while this screen
  // stays mounted; App bumps catalogVersion and the list must refetch.
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

  // The rule this screen exists to not smooth over: only one exam is
  // loaded at a time, so choosing another is a 2-4 minute destructive
  // rebuild. It must never happen from a single click.
  test("any other exam is a confirmed rebuild, not a navigation", async () => {
    const user = userEvent.setup();
    renderExams(0, ((start: () => Promise<unknown>) => void start()) as never);
    await screen.findByRole("heading", { name: "KCNA" });

    await user.click(within(cardFor("KCNA")).getByRole("button", { name: "Choose a mode" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // Nothing has happened yet — the dialog is a gate, not a receipt.
    expect(switchCalls).toEqual([]);
    expect(window.location.hash).toBe("");

    await user.click(screen.getByRole("button", { name: "Load it" }));
    await waitFor(() => expect(switchCalls).toEqual(["kcna-mock"]));
    // Still not there: the rebuild has to land first.
    expect(window.location.hash).toBe("");
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

  // The candidate asked for a mode screen, not a rebuild — the rebuild
  // was the price. When it lands, finish the job they actually started.
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

  // A failed switch leaves the old bank active. Nothing should open —
  // the modes on that screen would start the wrong exam.
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

    // The job finished and failed: App still bumps catalogVersion, but
    // `active` is unchanged.
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
