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
