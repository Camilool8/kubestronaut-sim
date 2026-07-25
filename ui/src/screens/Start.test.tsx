import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Start } from "./Start";
import type { BanksResponse, ExamInfo } from "../api";

const ckadExam: ExamInfo = {
  name: "ckad",
  title: "CKAD Simulator",
  durationSeconds: 7200,
  passingScore: 66,
  kubernetesVersion: "1.33",
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
