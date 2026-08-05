import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Exams } from "./Exams";
import type { CatalogResponse, ExamProgress } from "../api";
import { NARROW_QUERY } from "../lib/useMediaQuery";
import { TOUCH_ONLY_QUERY } from "../lib/deviceCapability";
import { matchMediaMock } from "../test/setup";

/** No attempt has ever been graded against this exam. */
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

  // The capsule used to count what could be SAT today, because nothing
  // recorded an attempt. History exists now, so it counts what has been
  // passed — a figure only the server can compute, since a path card's
  // pass state ignores every uncounted drill.
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
    // The slot is the description's, so only one of them is ever in it.
    expect(within(card).queryByText(/Twenty-two hands-on tasks/)).not.toBeInTheDocument();
  });

  // The rule the whole `counted` flag exists for: 100% on a one-domain
  // drill is a good session and it is not a CKAD result. The card must
  // neither hide the work nor let it fill the bar.
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
    // Read off the figure itself rather than the card: "To pass 66%" is
    // also a percentage on this card, and a loose query would pass on it.
    expect(card.querySelector(".exam-attempts-figure")?.textContent).toBe("—");
  });

  // App names the exam a switch targets and fills the mode screen's
  // header from this. The catalog's rows are a superset of the bank
  // fields, so the shape App already reads has to survive the move.
  test("reports the catalog up in the shape App reads", async () => {
    const onBanksLoaded = vi.fn();
    render(
      <Exams catalogVersion={0} onControlStart={noop as never} onBanksLoaded={onBanksLoaded} />,
    );
    await screen.findByRole("heading", { name: "CKAD" });

    expect(onBanksLoaded).toHaveBeenCalledWith(
      expect.objectContaining({ active: "ckad-mock-01" }),
    );
    const reported = onBanksLoaded.mock.calls[0][0] as { banks: { id: string }[] };
    expect(reported.banks.map((b) => b.id)).toEqual(["ckad-mock-01", "kcna-mock", "cks-mock"]);
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

  // A fresh `./sim up` builds nothing and loads nothing, so this screen
  // is the first thing a candidate sees and `active` is empty. The
  // confirmation still appears — it is still minutes of building — but
  // the switch copy would warn them about wiping cluster state they have
  // not created and replacing an exam they have not chosen.
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

      // Same request either way: the conductor decides it is a provision
      // by reading the bank file, not by being told.
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

// A hosted seat IS a Pod template. The multiple-choice one is a
// facilitator and 128Mi with no cluster in it, so a hands-on exam started
// from that seat booted the bank into an environment with no instances
// and no desktop: every task graded zero against "could not resolve
// hostname instance-1", and it was recorded as a real attempt. The
// catalog cannot tell — every bank is staged into every session — so this
// screen is where the seat has to be honoured.
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

  // A hosted seat is ONE exam now: the candidate chose the certification
  // in the lobby and the Pod was created, stamped and sized for it. The
  // hub refuses anything else, and this is so nobody is offered it first
  // and the reason is on screen rather than in a 409.
  test("a seat offers its own exam and no other, even of the same engine", async () => {
    banks = catalog("ckad-mock-01", [ckad, { ...kcna, examType: "hands-on" }, cks]);
    renderExams(0, noop as never, "practical", "ckad-mock-01");
    await screen.findByRole("heading", { name: "CKAD" });

    expect(within(cardFor("CKAD")).getByRole("button", { name: "Choose a mode" })).toBeTruthy();
    const other = cardFor("KCNA");
    expect(within(other).queryByRole("button")).toBeNull();
    expect(within(other).getByText("Not in this seat")).toBeTruthy();
    // Says what to do, and that finishing an attempt is not at stake.
    expect(within(other).getByText(/end the session and start this exam/i)).toBeTruthy();
  });

  // A Pod adopted from before exams were choosable records no bank. It
  // falls back to the rule that came first — the seat's flavour — rather
  // than to no rule at all.
  test("a seat that records no exam still refuses the wrong engine", async () => {
    renderExams(0, noop as never, "mcq", undefined);
    await screen.findByRole("heading", { name: "CKAD" });

    expect(within(cardFor("CKAD")).getByText("Not in this seat")).toBeTruthy();
    expect(within(cardFor("KCNA")).getByRole("button", { name: "Choose a mode" })).toBeTruthy();
  });
});

// A fact about the person in front of the screen rather than about the
// environment behind it, and the two are independent: a laptop in an
// mcq seat and a phone in a hands-on one are refused for different
// reasons and told different things.
describe("a device that cannot sit a hands-on exam", () => {
  afterEach(() => {
    matchMediaMock([]);
  });

  // Pressing "Choose a mode" on a hands-on card is not a navigation. It
  // is a two-to-four minute destructive rebuild of the cluster, and on a
  // phone it ends at a screen explaining that what it just built cannot
  // be sat. That cost is why this is refused at the card.
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

  // A desktop window dragged narrow, or zoomed to 400%, reports the same
  // width as a phone and has every capability the exam needs. WCAG
  // 1.4.10 makes that the case a width-only rule would get wrong.
  test("a narrowed desktop window is not refused", async () => {
    matchMediaMock([NARROW_QUERY]);
    renderExams();
    await screen.findByRole("heading", { name: "CKAD" });

    expect(within(cardFor("CKAD")).getByRole("button", { name: "Choose a mode" })).toBeTruthy();
  });

  // An exam already refused by the seat keeps that reason. It is the one
  // the candidate can act on without finding another computer.
  test("the seat's reason wins over the device's", async () => {
    matchMediaMock([TOUCH_ONLY_QUERY]);
    renderExams(0, noop as never, "mcq");
    await screen.findByRole("heading", { name: "CKAD" });

    expect(within(cardFor("CKAD")).getByText("Not in this seat")).toBeTruthy();
  });
});
