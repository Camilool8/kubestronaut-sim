import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Start } from "./Start";
import type { BanksResponse, ExamInfo } from "../api";

const ckadExam: ExamInfo = {
  name: "ckad",
  title: "CKAD Simulator",
  examType: "hands-on",
  durationSeconds: 7200,
  passingScore: 66,
  kubernetesVersion: "1.33",
  questionCount: 0,
  questions: [],
};

const ckaExam: ExamInfo = { ...ckadExam, name: "cka", title: "CKA Simulator" };

const banksFor = (active: string): BanksResponse => ({
  active,
  banks: [
    { id: "ckad", title: "CKAD", examType: "performance", available: true },
    { id: "cka", title: "CKA", examType: "performance", available: true },
  ],
});

function mockApi(exam: ExamInfo, banks: BanksResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/exam")) {
        return new Response(JSON.stringify(exam), { status: 200 });
      }
      if (url.endsWith("/api/control/banks")) {
        return new Response(JSON.stringify(banks), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Start catalog refresh", () => {
  test("refetches exam and banks when catalogVersion changes", async () => {
    mockApi(ckadExam, banksFor("ckad"));
    const noop = () => {};
    const { rerender } = render(
      <Start catalogVersion={0} onSessionChange={noop} onControlStart={noop} onBanksLoaded={noop} />,
    );
    expect(await screen.findByText("CKAD Simulator")).toBeInTheDocument();

    // A completed switch job changed the active bank behind our back —
    // App bumps catalogVersion; Start must refetch, not show stale data.
    mockApi(ckaExam, banksFor("cka"));
    rerender(<Start catalogVersion={1} onSessionChange={noop} onControlStart={noop} onBanksLoaded={noop} />);
    expect(await screen.findByText("CKA Simulator")).toBeInTheDocument();
  });
});

describe("Start catalog failures", () => {
  // Reproduced 2026-07-25 by stopping the conductor: GET /api/control/banks
  // returns 502, the catch left the catalog null, and the entire "CHOOSE
  // YOUR EXAM" section disappeared with no error. The lobby looked like a
  // single-exam app.
  test("shows an error with a retry when the catalog cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/control/banks")) return new Response("", { status: 502 });
        if (url.endsWith("/api/exam"))
          return new Response(JSON.stringify(ckadExam), { status: 200 });
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(
      <Start
        onSessionChange={() => {}}
        onControlStart={() => {}}
        catalogVersion={0}
        onBanksLoaded={() => {}}
      />,
    );

    expect(await screen.findByText(/couldn't load the exam catalog/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
