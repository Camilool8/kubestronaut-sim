import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { McqExam } from "./McqExam";
import { marksStore } from "../components/marksStore";
import { toastStore } from "../components/toastStore";
import { MCQ_COMPACT_QUERY } from "../lib/useMediaQuery";
import { matchMediaMock } from "../test/setup";
import type { SessionSnapshot } from "../api";
import { strings } from "../strings";

const session: SessionSnapshot = {
  state: "running",
  bank: "kcna-mock",
  startedAt: "2026-07-31T12:00:00Z",
  durationSeconds: 5400,
  remainingSeconds: 5000,
  endReason: "",
  mode: "exam",
  untimed: false,
};

const examJSON = {
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

const q01JSON = {
  id: "q01",
  domain: "Kubernetes Fundamentals",
  markdown: "Which component persists cluster state?",
  options: ["The kubelet", "etcd", "kube-proxy"],
  multi: false,
};

const q02JSON = {
  id: "q02",
  domain: "Container Orchestration",
  markdown: "Which are container interface standards? Choose all that apply.",
  options: ["CNI", "systemd", "CRI"],
  multi: true,
};

interface FetchLogEntry {
  url: string;
  method: string;
  body: unknown;
}

function stubFetch(
  stored: Record<string, number[]> = {},
  failPut = false,
  focusStatus = 200,
) {
  const log: FetchLogEntry[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      log.push({ url, method, body });

      if (url.includes("/api/session/focus")) {
        return new Response(focusStatus === 200 ? "{}" : JSON.stringify({ error: "no route" }), {
          status: focusStatus,
        });
      }

      if (method === "PUT" && url.includes("/answer")) {
        if (failPut) {
          return new Response(JSON.stringify({ error: "no attempt is running" }), { status: 409 });
        }
        const id = url.split("/")[3];
        const selected = [...((body as { selected: number[] }).selected)].sort((a, b) => a - b);
        return new Response(JSON.stringify({ id, selected }), { status: 200 });
      }

      const payload = url.includes("/api/exam")
        ? examJSON
        : url.includes("/api/answers")
          ? { answers: stored }
          : url.includes("/api/questions/q02")
            ? q02JSON
            : url.includes("/api/questions/")
              ? q01JSON
              : {};
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return log;
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: strings.header.menuLabel }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  toastStore.clear();
  marksStore.reset();

  window.sessionStorage.clear();
});

describe("McqExam answering", () => {
  test("selecting an option PUTs it and marks the tile answered", async () => {
    const log = stubFetch();
    const user = userEvent.setup();
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    await user.click(await screen.findByRole("checkbox", { name: /etcd/ }));

    await waitFor(() => {
      const put = log.find((e) => e.method === "PUT" && e.url.endsWith("/answer"));
      expect(put?.url).toBe("/api/questions/q01/answer");
      expect(put?.body).toEqual({ selected: [1] });
    });
    expect(screen.getByRole("checkbox", { name: /etcd/ })).toBeChecked();
  });

  test("single-answer questions swap the selection instead of stacking it", async () => {
    const log = stubFetch();
    const user = userEvent.setup();
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    await user.click(await screen.findByRole("checkbox", { name: /etcd/ }));
    await user.click(screen.getByRole("checkbox", { name: /kube-proxy/ }));

    await waitFor(() => {
      const puts = log.filter((e) => e.method === "PUT" && e.url.endsWith("/answer"));
      expect(puts).toHaveLength(2);
      expect(puts[1].body).toEqual({ selected: [2] });
    });
    expect(screen.getByRole("checkbox", { name: /etcd/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /kube-proxy/ })).toBeChecked();
  });

  test("re-clicking the selected option clears the answer", async () => {
    const log = stubFetch({ q01: [1] });
    const user = userEvent.setup();
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    const option = await screen.findByRole("checkbox", { name: /etcd/ });
    await waitFor(() => expect(option).toBeChecked());
    await user.click(option);

    await waitFor(() => {
      const put = log.find((e) => e.method === "PUT" && e.url.endsWith("/answer"));
      expect(put?.body).toEqual({ selected: [] });
    });
    expect(option).not.toBeChecked();
  });

  test("multi-select accumulates selections", async () => {
    const log = stubFetch();
    const user = userEvent.setup();
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    await screen.findByText("Which component persists cluster state?");
    await user.click(screen.getByRole("button", { name: /next question/i }));
    await user.click(await screen.findByRole("checkbox", { name: /CRI/ }));
    await user.click(screen.getByRole("checkbox", { name: /CNI/ }));

    await waitFor(() => {
      const puts = log.filter((e) => e.method === "PUT" && e.url.endsWith("/answer"));
      expect(puts).toHaveLength(2);
      expect(puts[1].url).toBe("/api/questions/q02/answer");
      expect(puts[1].body).toEqual({ selected: [0, 2] });
    });
  });

  test("hydrates stored answers on mount, so a reload resumes", async () => {
    stubFetch({ q01: [1] });
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: /etcd/ })).toBeChecked(),
    );
  });

  test("a failed save reverts the selection and says so", async () => {
    stubFetch({}, true);
    const user = userEvent.setup();
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    const option = await screen.findByRole("checkbox", { name: /etcd/ });
    await user.click(option);

    await waitFor(() => expect(option).not.toBeChecked());
    expect(toastStore.list().length).toBeGreaterThan(0);
  });

  test("submit dialog counts unanswered questions from server state", async () => {
    stubFetch({ q01: [1] });
    const user = userEvent.setup();
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    await screen.findByText("Which component persists cluster state?");
    await openMenu(user);

    await user.click(screen.getByRole("button", { name: /submit exam/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/1 question is unanswered/)).toBeInTheDocument();

    expect(screen.getByText("Q2", { selector: ".submit-review-ids" })).toBeInTheDocument();
    expect(screen.queryByText("q02", { selector: ".submit-review-ids" })).not.toBeInTheDocument();
  });

  test("a training attempt submits a session, not an exam", async () => {
    stubFetch();
    const user = userEvent.setup();
    const training: SessionSnapshot = { ...session, mode: "training", untimed: true };
    render(<McqExam session={training} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    await screen.findByText("Which component persists cluster state?");

    await openMenu(user);
    expect(screen.queryByRole("button", { name: /submit exam/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /submit session/i }));
    expect(await screen.findByRole("dialog")).toHaveAccessibleName(/training/i);
    expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument();
  });
});

describe("McqExam attempt state", () => {
  test("the menu counts answered, flagged and unseen", async () => {
    stubFetch({ q01: [1] });
    const user = userEvent.setup();
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);
    await screen.findByText("Which component persists cluster state?");

    await openMenu(user);
    await waitFor(() =>
      expect(screen.getByText(/Answered 1 · Flagged 0 · Unseen 1/)).toBeInTheDocument(),
    );
  });

  test("F flags the question on screen and the tally follows", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);
    await screen.findByText("Which component persists cluster state?");

    await user.keyboard("f");

    expect(screen.getByRole("button", { name: /mark for review/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await openMenu(user);
    expect(screen.getByText(/Flagged 1/)).toBeInTheDocument();
  });

  test("the question on screen is reported for the server's timing", async () => {
    const log = stubFetch();
    const user = userEvent.setup();
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);
    await screen.findByText("Which component persists cluster state?");

    await waitFor(() => {
      const focus = log.filter((e) => e.url === "/api/session/focus");
      expect(focus[focus.length - 1]?.body).toEqual({ question: "q01" });
    });

    await user.click(screen.getByRole("button", { name: /next question/i }));

    await waitFor(() => {
      const focus = log.filter((e) => e.url === "/api/session/focus");
      expect(focus[focus.length - 1]?.body).toEqual({ question: "q02" });
    });
  });

  test("a facilitator with no focus route is a no-op, not a warning", async () => {
    stubFetch({}, false, 404);
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    await screen.findByText("Which component persists cluster state?");
    expect(toastStore.list()).toHaveLength(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("McqExam navigator", () => {
  async function openNavigator(stored: Record<string, number[]> = {}) {
    stubFetch(stored);
    const user = userEvent.setup();
    const { container } = render(
      <McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />,
    );
    await screen.findByText("Which component persists cluster state?");
    await user.click(screen.getByRole("button", { name: /show all questions/i }));
    const grid = container.querySelector<HTMLElement>("#mcq-jump");
    if (!grid) throw new Error("the navigator did not open");
    return { user, grid: within(grid) };
  }

  test("G opens the navigator with an option focused", async () => {
    stubFetch();
    const user = userEvent.setup();
    const { container } = render(
      <McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />,
    );
    await screen.findByText("Which component persists cluster state?");

    await user.click(screen.getByRole("checkbox", { name: /etcd/i }));
    expect(document.activeElement?.tagName).toBe("INPUT");

    await user.keyboard("g");
    await waitFor(() => expect(container.querySelector("#mcq-jump")).not.toBeNull());
  });

  test("the tiles are attempt positions, never bank ids", async () => {
    const { grid } = await openNavigator();

    expect(grid.getByRole("button", { name: /^Q1\b/ })).toBeInTheDocument();
    expect(grid.getByRole("button", { name: /^Q2\b/ })).toBeInTheDocument();
    expect(grid.queryByRole("button", { name: /q0\d/ })).toBeNull();
  });

  test("a saved answer is a tile state, because here the UI genuinely knows", async () => {
    const { grid } = await openNavigator({ q01: [1] });
    await waitFor(() =>
      expect(grid.getByRole("button", { name: /^Q1\b/ })).toHaveAccessibleName(/(?<!un)answered/),
    );
    expect(grid.getByRole("button", { name: /^Q2\b/ })).toHaveAccessibleName(/unanswered/);
  });

  test("picking a tile moves the screen to that question", async () => {
    const { user, grid } = await openNavigator();
    await user.click(grid.getByRole("button", { name: /^Q2\b/ }));
    await screen.findByText("Which are container interface standards? Choose all that apply.");
    expect(document.querySelector("#mcq-jump")).toBeNull();
  });

  test("G opens and closes it, the same binding the hands-on panel carries", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);
    await screen.findByText("Which component persists cluster state?");

    await user.keyboard("g");
    expect(document.querySelector("#mcq-jump")).not.toBeNull();
    await user.keyboard("g");
    expect(document.querySelector("#mcq-jump")).toBeNull();
  });
});

describe("McqExam footer navigation", () => {
  test("Previous is disabled on the first question and steps back from later ones", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    await screen.findByText("Which component persists cluster state?");
    expect(screen.getByRole("button", { name: /previous question/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /next question/i }));
    await screen.findByText("Which are container interface standards? Choose all that apply.");

    await user.click(screen.getByRole("button", { name: /previous question/i }));
    await screen.findByText("Which component persists cluster state?");
  });

  test("the last question's footer shows Submit exam instead of Next, and it opens the confirm dialog", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    await screen.findByText("Which component persists cluster state?");
    expect(screen.getByRole("button", { name: /next question/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /next question/i }));
    await screen.findByText("Which are container interface standards? Choose all that apply.");

    expect(screen.queryByRole("button", { name: /next question/i })).not.toBeInTheDocument();
    const submitButtons = screen.getAllByRole("button", { name: /submit exam/i });
    expect(submitButtons).toHaveLength(1);

    await user.click(submitButtons[0]);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  test("the reassurance line is on screen, not buried in a dialog", async () => {
    stubFetch();
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    expect(
      await screen.findByText(/answers save as you go · nothing is graded until submit/i),
    ).toBeInTheDocument();
  });
});

describe("McqExam on a phone", () => {
  afterEach(() => {
    matchMediaMock([]);
  });

  const renderCompact = () => {
    matchMediaMock([MCQ_COMPACT_QUERY]);
    return render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);
  };

  test("the bar keeps the clock, and the menu is the same one every screen has", async () => {
    stubFetch();
    renderCompact();
    await screen.findByText(/persists cluster state/);

    expect(screen.getByRole("timer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: strings.header.menuLabel })).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Submit exam" })).toBeNull();
  });

  test("the menu holds the attempt's progress and its one irreversible action", async () => {
    stubFetch({ q01: [1] });
    const user = userEvent.setup();
    renderCompact();
    await screen.findByText(/persists cluster state/);

    await openMenu(user);
    const panel = screen.getByRole("group", { name: strings.header.menuLabel });
    expect(within(panel).getByText(/Answered 1/)).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Submit exam" })).toBeInTheDocument();

    expect(within(panel).getByRole("button", { name: /Theme/ })).toBeInTheDocument();
  });

  test("submitting from the menu opens the confirmation", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderCompact();
    await screen.findByText(/persists cluster state/);

    await openMenu(user);
    await user.click(screen.getByRole("button", { name: "Submit exam" }));

    expect(await screen.findByRole("dialog", { name: /submit/i })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: strings.header.menuLabel })).toBeNull();
  });

  test("the action bar drops its labels but keeps every accessible name", async () => {
    stubFetch();
    renderCompact();
    await screen.findByText(/persists cluster state/);

    const previous = screen.getByRole("button", { name: /previous/i });
    expect(previous).toBeInTheDocument();
    expect(previous.textContent).not.toMatch(/prev/i);

    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /question 1 of 2/i })).toBeInTheDocument();
  });

  test("the navigator opens as a modal sheet, not an inline panel", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderCompact();
    await screen.findByText(/persists cluster state/);

    await user.click(screen.getByRole("button", { name: /question 1 of 2/i }));

    const sheet = screen.getByRole("dialog", { name: /questions/i });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(within(sheet).getByRole("button", { name: /^Q1/ })).toBeInTheDocument();
  });

  test("and stays a plain disclosure on a desktop", async () => {
    stubFetch();
    const user = userEvent.setup();
    matchMediaMock([]);
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);
    await screen.findByText(/persists cluster state/);

    await user.click(screen.getByRole("button", { name: /navigator/i }));

    expect(screen.queryByRole("dialog", { name: /questions/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^Q1/ })).toBeInTheDocument();
  });
});
