import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Score } from "./Score";
import { marksStore } from "../components/marksStore";
import { strings } from "../strings";

// The BARE Results object. getResults() (api.ts:171-186) wraps a 200 body
// as {status: "ready", results: <body>} itself, so a fixture that already
// carries `status`/`results` gets double-wrapped and Score crashes before
// rendering anything.
//
// This one is deliberately OLD-SHAPED: no domains, no verdicts, no
// weights, no timings, no seed, no mode. That is the payload a result
// graded before those fields existed serves back verbatim after an
// upgrade, and it is the path a real upgrade hits — so it is the default
// every test here runs against unless it is specifically about a new
// field.
const results = {
  bank: "ckad-mock-01",
  gradedAt: "2026-08-01T09:00:00Z",
  percent: 40,
  passed: false,
  earned: 2,
  total: 5,
  passingScore: 66,
  questions: [
    {
      id: "q01",
      // Optional in the bank format; the review row shows it beside the id.
      title: "Namespaces & quotas",
      instance: "instance-1",
      domain: "Application Environment",
      earned: 2,
      total: 5,
      // All three outcomes a check can have. The skipped one never ran —
      // malformed points header in the bank — and must not read as a
      // failure the candidate should study.
      checks: [
        { name: "10_ns.sh", desc: "Namespace exists", points: 2, earned: 2, passed: true, message: "" },
        { name: "20_quota.sh", desc: "Quota applied", points: 3, earned: 0, passed: false, message: "quota missing" },
        { name: "30_broken.sh", desc: "Labels match", points: 0, earned: 0, passed: false, message: "", skipped: true },
      ],
    },
  ],
};

// The same attempt as a current server grades it: weighted score, domain
// rollup, per-question verdicts and weights, timings, seed and mode.
const modernResults = {
  ...results,
  percent: 74,
  pointsPercent: 71,
  passed: true,
  earned: 12,
  total: 17,
  mode: "speed",
  seed: "7f3a91",
  durationSeconds: 3600,
  elapsedSeconds: 2592,
  domains: [
    {
      domain: "Application Environment",
      earned: 2,
      total: 5,
      weightPct: 25,
      questionCount: 1,
    },
    {
      domain: "Services and Networking",
      earned: 10,
      total: 12,
      weightPct: 75,
      questionCount: 1,
    },
  ],
  questions: [
    {
      ...results.questions[0],
      weightPct: 25,
      verdict: "partial",
      timeSpentSeconds: 521,
      targetSeconds: 360,
    },
    {
      id: "q02",
      title: "Expose a Deployment",
      instance: "instance-1",
      domain: "Services and Networking",
      earned: 10,
      total: 12,
      checks: [],
      weightPct: 75,
      verdict: "partial",
      timeSpentSeconds: 200,
      targetSeconds: 360,
    },
  ],
};

function stubResults(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/results"))
        return new Response(JSON.stringify(body), { status: 200 });
      if (url.includes("/solution"))
        return new Response(
          JSON.stringify({ id: "q01", markdown: "```yaml\nkind: Pod\n```" }),
          { status: 200 },
        );
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );
}

beforeEach(() => {
  marksStore.reset();
  stubResults(results);
});

afterEach(() => {
  vi.unstubAllGlobals();
  // jsdom keeps one location for the whole file. A fragment left behind
  // by a routing test would put every test after it on the deep dive.
  window.location.hash = "";
});


describe("Score grading wait", () => {
  // This screen was a heading and a paragraph behind a 3s poll — nothing on
  // it changed for the whole grade, which is how a normal wait starts
  // reading as a hang. The elapsed counter is the signal that has to keep
  // working when the user has asked for no motion, so it is what is pinned
  // here rather than the bar beside it.
  test("the wait reports elapsed time, and keeps reporting it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ state: "grading" }), { status: 202 })),
    );

    render(<Score onNewAttempt={() => {}} endReason="" />);

    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getByText(/elapsed 0\.0s/i)).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(12_000);
    expect(screen.getByText(/elapsed 12s/i)).toBeInTheDocument();

    vi.useRealTimers();
  });

  test("the wait does not overstate how long grading takes", () => {
    // A measured full CKAD grade is ~16s. "This can take a minute" was a
    // guess, and an overstated wait is the same defect as an understated one.
    expect(strings.score.gradingBody).toMatch(/well under a minute/i);
    expect(strings.score.gradingBody).not.toMatch(/can take a minute/i);
  });
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

describe("Score review rows", () => {
  test("a question's bank title shows beside its ssh-able id", async () => {
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    await screen.findByText("q01");
    expect(screen.getByText("Namespaces & quotas")).toBeInTheDocument();
  });

  test("a skipped check says it never ran instead of posing as a failure", async () => {
    const user = userEvent.setup();
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    await user.click(await screen.findByText("q01"));

    const skippedRow = screen.getByText("Labels match").closest("tr");
    expect(skippedRow).not.toBeNull();
    expect(skippedRow).toHaveTextContent(/not graded/i);
    expect(skippedRow).toHaveTextContent("Skipped:");
    // The failed check keeps its own reading — the two must not blur.
    const failedRow = screen.getByText("Quota applied").closest("tr");
    expect(failedRow).toHaveTextContent("Failed:");
    expect(failedRow).toHaveTextContent("quota missing");
  });
});

describe("Score heading", () => {
  // The scored state was two anonymous divs, then a bare percentage with
  // PASS underneath it — one sentence split across two type sizes, with
  // the threshold it was measured against nowhere on the banner.
  test("the verdict is the screen's h1 and carries the threshold it was measured against", async () => {
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    // Named, because the grading state's own h1 is on screen until the
    // first poll lands and would satisfy a bare level-1 query.
    const heading = await screen.findByRole("heading", { level: 1, name: /not passed/i });
    expect(heading).toHaveTextContent("40%");
    expect(heading).toHaveTextContent("66% threshold");
  });

  test("there is exactly one h1 on the scored screen", async () => {
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    await screen.findByRole("heading", { level: 1, name: /not passed/i });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

describe("Score banner", () => {
  test("names the run, the date and the seed the draw came from", async () => {
    stubResults(modernResults);
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    const eyebrow = await screen.findByText(/ckad-mock-01/);
    expect(eyebrow).toHaveTextContent("Mastery run");
    // UTC, deliberately: gradedAt is an instant, and the reader's zone
    // would move the printed day across a midnight for no benefit.
    expect(eyebrow).toHaveTextContent("1 Aug 2026");
    expect(eyebrow).toHaveTextContent("draw seed 7f3a91");
  });

  // The path a real upgrade hits. An old result has no seed, no mode and
  // no clock, and the banner still has to render.
  test("renders without a seed, a mode or a clock", async () => {
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    const eyebrow = await screen.findByText(/ckad-mock-01/);
    expect(eyebrow).not.toHaveTextContent("draw seed");
    expect(eyebrow).not.toHaveTextContent("run");
    // With no clock recorded the second stat falls back to the one figure
    // every result has ever carried.
    const stat = screen.getByText(strings.score.statPoints).closest(".results-stat");
    expect(stat).toHaveTextContent("2/5");
  });

  test("reports the clock as used-of-total when the attempt recorded one", async () => {
    stubResults(modernResults);
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    await screen.findByRole("heading", { level: 1, name: /passed/i });
    // 2592s of 3600s, printed without formatClock's leading "0:".
    expect(screen.getByText("43:12")).toBeInTheDocument();
    expect(screen.getByText("of 1:00:00 used")).toBeInTheDocument();
    expect(screen.getByText(/16:48 left on a 1:00:00 clock/)).toBeInTheDocument();
  });

  // Two percentages that differ with no explanation reads as a bug.
  test("explains the weighted score when it differs from the raw one", async () => {
    stubResults(modernResults);
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    expect(await screen.findByText(/raw points come to 71%/i)).toBeInTheDocument();
  });

  test("says nothing about raw points when the two figures agree", async () => {
    stubResults({ ...modernResults, pointsPercent: 74 });
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    await screen.findByRole("heading", { level: 1, name: /passed/i });
    expect(screen.queryByText(/raw points come to/i)).toBeNull();
  });

  // A draw narrowed to some domains covered part of the curriculum. It
  // cannot be reported as a pass however well it went.
  test("a filtered draw is never presented as a pass", async () => {
    stubResults({
      ...modernResults,
      domainFilter: ["Services and Networking", "Observability"],
    });
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    const heading = await screen.findByRole("heading", { level: 1, name: /filtered draw/i });
    expect(heading).toHaveTextContent("74% on a filtered draw");
    expect(heading).not.toHaveTextContent(/passed/i);
    expect(
      screen.getByText(/drew only from Services and Networking, Observability/),
    ).toBeInTheDocument();
    expect(screen.getByText(/no pass or fail here/)).toBeInTheDocument();
  });

  test("a mastery attempt says it is not a comparable exam result", async () => {
    stubResults(modernResults);
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    expect(await screen.findByText(/Mastery attempt: not a comparable/)).toBeInTheDocument();
  });

  // The threshold marker is a decorative token by contrast (--warn-marker
  // is 1.68:1 on --surface). It may never be the only thing saying where
  // the threshold is.
  test("the pass threshold is spelled out, not only drawn", async () => {
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    expect(await screen.findByText("pass 66%")).toBeInTheDocument();
  });
});

describe("Score sidebar", () => {
  test("names the weak domains to study next", async () => {
    stubResults(modernResults);
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    const next = (await screen.findByText(strings.score.nextTitle)).closest("div");
    expect(next).toHaveTextContent("Application Environment");
  });

  // The two halves have to happen in this order and both have to happen.
  // An ended session cannot start anything, so the route is written first
  // and waits; the reset is what eventually lets App read it.
  test("the drill control writes the route, then asks for the rebuild", async () => {
    const user = userEvent.setup();
    stubResults(modernResults);
    let reset = 0;
    render(<Score onNewAttempt={() => (reset += 1)} endReason="submitted" />);

    await user.click(await screen.findByRole("button", { name: strings.score.nextDrill }));
    expect(window.location.hash).toContain("/mode?domain=");
    expect(window.location.hash).toContain("Application+Environment");
    expect(reset).toBe(1);
  });

  // Narrowing a narrowed run compounds a thin signal. The dashboard reads
  // every attempt and is the right place to pick the next drill.
  test("offers no drill on a run that was already filtered", async () => {
    stubResults({ ...modernResults, domainFilter: ["Application Environment, Configuration and Security"] });
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    await screen.findByText(strings.score.nextTitle);
    expect(screen.queryByRole("button", { name: strings.score.nextDrill })).toBeNull();
  });

  test("says so when nothing fell below the threshold", async () => {
    stubResults({
      ...modernResults,
      passingScore: 20,
      questions: [{ ...modernResults.questions[1] }],
      domains: undefined,
    });
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    expect(await screen.findByText(/nothing fell below the threshold/i)).toBeInTheDocument();
  });
});

// This screen owns #/results/<id>, the explanation deep dive (1j).
// App.tsx does not change and does not need to: the visible screen is a
// function of session.state first, and this route only chooses between
// views INSIDE `ended` — the same arrangement #/exams/<id>/mode uses
// inside `idle`.
describe("Score routing to the deep dive", () => {
  test("#/results/<id> opens that task in full instead of the verdicts table", async () => {
    window.location.hash = "#/results/q01";
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    expect(
      await screen.findByRole("heading", { level: 1, name: /namespaces & quotas/i }),
    ).toBeInTheDocument();
    // The table it was opened from is gone, and so is the banner's own h1
    // — one screen, one first-level heading.
    expect(screen.queryByText(strings.score.verdictsTitle)).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  // The screen was deep-linked to a question from an earlier draw. It
  // must not blank, and it must not fall back to a different task's
  // explanation either.
  test("an id that is not in this attempt says so rather than blanking", async () => {
    window.location.hash = "#/results/q99";
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    expect(await screen.findByText(strings.explain.unknownTask)).toBeInTheDocument();
  });

  test("the bare #/results fragment is the verdicts table, as it always was", async () => {
    window.location.hash = "#/results";
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    expect(await screen.findByText(strings.score.verdictsTitle)).toBeInTheDocument();
  });

  // Any fragment that is not results/... behaves exactly as it did before
  // this screen existed — including a stale one left over from the lobby.
  test("an unrelated fragment renders the results body unchanged", async () => {
    window.location.hash = "#/exams";
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);
    expect(await screen.findByText(strings.score.verdictsTitle)).toBeInTheDocument();
    expect(screen.queryByText(strings.explain.unknownTask)).toBeNull();
  });

  // The whole loop, through real anchors: a fragment link needs no click
  // handler and no router import, so the browser's own navigation is what
  // is being asserted here.
  test("a row's link opens the deep dive, and the deep dive gets back", async () => {
    const user = userEvent.setup();
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    await user.click(await screen.findByText("q01"));
    await user.click(screen.getByRole("link", { name: /full explanation/i }));

    expect(
      await screen.findByRole("heading", { level: 1, name: /namespaces & quotas/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: strings.explain.backToResults }));
    expect(await screen.findByText(strings.score.verdictsTitle)).toBeInTheDocument();
  });
});

// The screen where a candidate finds out they ran out of time is the
// right place to offer the technique notes — but only when the bank
// actually ships some. Score has no exam in its props, so it asks.
describe("the exam tips opener", () => {
  function stubWithExam(exam: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/results"))
          return new Response(JSON.stringify(results), { status: 200 });
        if (url.endsWith("/api/exam/tips"))
          return new Response(JSON.stringify({ markdown: "## Pacing\n\nMove on." }), {
            status: 200,
          });
        if (url.endsWith("/api/exam")) return new Response(JSON.stringify(exam), { status: 200 });
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );
  }

  test("is absent when the bank ships no tips", async () => {
    stubWithExam({ name: "ckad-mock-01" });
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    await screen.findByRole("button", { name: strings.control.newAttempt });
    expect(screen.queryByRole("button", { name: strings.tips.open })).not.toBeInTheDocument();
  });

  test("opens the bank's tips when it does", async () => {
    stubWithExam({ name: "ckad-mock-01", hasTips: true });
    const user = userEvent.setup();
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    await user.click(await screen.findByRole("button", { name: strings.tips.open }));

    expect(screen.getByRole("dialog", { name: strings.tips.title })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Pacing" })).toBeInTheDocument();
  });

  // A failed exam fetch must not grow an error onto a screen that has
  // just finished grading: the button is an offer, not a result.
  test("a failed exam fetch costs the offer and nothing else", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/results"))
          return new Response(JSON.stringify(results), { status: 200 });
        if (url.endsWith("/api/exam"))
          return new Response(JSON.stringify({ error: "no exam" }), { status: 503 });
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );
    render(<Score onNewAttempt={() => {}} endReason="submitted" />);

    await screen.findByRole("button", { name: strings.control.newAttempt });
    expect(screen.queryByRole("button", { name: strings.tips.open })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
