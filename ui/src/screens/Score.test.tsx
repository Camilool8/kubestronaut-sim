import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Score } from "./Score";

// The BARE Results object. getResults() (api.ts:171-186) wraps a 200 body
// as {status: "ready", results: <body>} itself, so a fixture that already
// carries `status`/`results` gets double-wrapped and Score crashes before
// rendering anything.
const results = {
  percent: 0,
  passed: false,
  earned: 0,
  total: 5,
  passingScore: 66,
  questions: [
    {
      id: "q01",
      instance: "instance-1",
      domain: "Application Environment",
      earned: 0,
      total: 5,
      checks: [],
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/results"))
        return new Response(JSON.stringify(results), { status: 200 });
      if (url.includes("/solution"))
        return new Response(
          JSON.stringify({ id: "q01", markdown: "```yaml\nkind: Pod\n```" }),
          { status: 200 },
        );
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Score grading failures", () => {
  // The reported dead end: with the facilitator unreachable, handleRetry
  // set "grading", `await endSession()` rejected, and every statement
  // after that await was skipped — no poll restarted (clearPoll had
  // already run when the status became "error"), no error rendered. The
  // user traded their only affordance for a screen that would never
  // change again without a page reload, right after a timed exam.
  test("a Retry that cannot reach the facilitator brings the failure back, not a permanent 'Grading…'", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/session/end") && init?.method === "POST") {
          // fetch itself rejects: the facilitator's host is unreachable.
          throw new TypeError("Failed to fetch");
        }
        if (url.endsWith("/api/results")) {
          return new Response(JSON.stringify({ error: "grader: ssh timeout" }), {
            status: 500,
          });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(
      await screen.findByText(/couldn't ask the facilitator to grade again/i),
    ).toBeInTheDocument();
    // And the way out is still on screen.
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText(/evaluating your exam/i)).not.toBeInTheDocument();
  });

  // Same dead end reached through a refusal rather than a rejection: a
  // 409 resolves {ok:false} and was discarded, so the screen went back to
  // "Grading…" while /api/results answered 409 (not-ended) forever.
  test("a Retry the facilitator refuses is reported too", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/session/end") && init?.method === "POST") {
          return new Response(JSON.stringify({ error: "no session to end" }), {
            status: 409,
          });
        }
        if (url.endsWith("/api/results")) {
          return new Response(JSON.stringify({ error: "grader: ssh timeout" }), {
            status: 500,
          });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByText(/no session to end/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("Score results poll", () => {
  // The poll had no error branch at all: getResults() throws for any
  // unexpected status, and the fetch rejects outright while the
  // facilitator restarts (App.tsx documents that as normal). Both
  // rendered as "Evaluating your exam…" — in-flight state shown as
  // truth — while throwing a rejection every 3 seconds.
  test("says a poll could not reach the facilitator instead of rendering the wait as progress", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/results")) throw new TypeError("Failed to fetch");
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    expect(
      await screen.findByText(/still trying to reach the facilitator/i),
    ).toBeInTheDocument();
    // Still a wait, not a verdict: the screen keeps its grading copy
    // because the next poll may well succeed.
    expect(screen.getByText(/evaluating your exam/i)).toBeInTheDocument();
  });

  // The other half of that contract: a failed poll must not tear the poll
  // down, because a restarting facilitator heals itself.
  test("keeps polling after a failed poll, so a recovering facilitator renders the score", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/results")) {
          calls++;
          if (calls === 1) throw new TypeError("Failed to fetch");
          return new Response(JSON.stringify(results), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    expect(
      await screen.findByText(/still trying to reach the facilitator/i),
    ).toBeInTheDocument();

    // GRADING_POLL_MS is 3s; the second tick succeeds.
    await screen.findByText("q01", {}, { timeout: 6_000 });
    expect(screen.queryByText(/still trying to reach the facilitator/i)).toBeNull();
  }, 10_000);
});

describe("Score heading", () => {
  // The scored state was two anonymous divs: the one number the candidate
  // came for had no heading to navigate to, and announced as a bare
  // percentage with nothing naming it.
  test("the percentage is the screen's h1 and says what the number is", async () => {
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    // Named, because the grading state's own h1 is on screen until the
    // first poll lands and would satisfy a bare level-1 query.
    const heading = await screen.findByRole("heading", { level: 1, name: /your score/i });
    expect(heading).toHaveTextContent("0%");
  });

  // Promoting the verdict too would put two headings on one banner and
  // announce PASS/FAIL twice; it already follows the heading immediately.
  test("the verdict stays out of the heading structure", async () => {
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    expect(await screen.findByText("FAIL")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

describe("Score solutions", () => {
  // Solutions used to render through a bare <ReactMarkdown> with no
  // components override and no styles, so a long yaml line pushed the whole
  // page sideways and inline values were not copyable.
  test("renders solution markdown through the shared renderer", async () => {
    const user = userEvent.setup();
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    await user.click(await screen.findByText("q01"));
    await user.click(screen.getByText(/show solution/i));

    // The shared renderer's code-block chrome, which the bare one lacked.
    expect(await screen.findByText("yaml")).toBeInTheDocument();
  });
});
