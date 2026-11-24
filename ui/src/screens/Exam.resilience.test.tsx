import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Exam } from "./Exam";
import type { SessionSnapshot } from "../api";
import { markIntroSeen } from "../components/ExamIntro";
import { END_EXAM_BUTTON_ID } from "../components/TimerBar";
import { toastStore } from "../components/toastStore";
import { strings } from "../strings";

const { desktop } = vi.hoisted(() => ({ desktop: { fail: true } }));

vi.mock("../components/DesktopViewport", () => ({
  DesktopViewport: () => {
    if (desktop.fail) throw new Error("noVNC failed to start");
    return <div data-testid="desktop-ok" />;
  },
}));

const runningSession: SessionSnapshot = {
  state: "running",
  bank: "ckad-mock-01",
  startedAt: "2026-11-23T09:00:00Z",
  durationSeconds: 7200,
  remainingSeconds: 600,
  endReason: "",
  mode: "exam",
  untimed: false,
};

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  desktop.fail = true;
  markIntroSeen();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/exam")) {
        return json({
          name: "ckad-mock-01",
          title: "CKAD Mock Exam 01",
          examType: "hands-on",
          durationSeconds: 7200,
          passingScore: 66,
          kubernetesVersion: "1.35",
          questionCount: 0,
          questions: [],
        });
      }
      return json({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  toastStore.clear();
  window.localStorage.clear();
});

describe("Exam when the desktop pane fails", () => {
  test("the timer and Submit stay up, and Try again remounts only the pane", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<Exam session={runningSession} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    expect(await screen.findByText(strings.paneError.desktopTitle)).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("0:10:00");
    expect(screen.getByRole("button", { name: "Submit exam" })).toBeInTheDocument();

    desktop.fail = false;
    await user.click(screen.getByRole("button", { name: strings.paneError.retry }));

    expect(await screen.findByTestId("desktop-ok")).toBeInTheDocument();
    expect(screen.queryByText(strings.paneError.desktopTitle)).not.toBeInTheDocument();
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });
});

describe("Exam toast lifecycle", () => {
  test("warnings raised during the exam do not follow the candidate off it", async () => {
    desktop.fail = false;
    const { unmount } = render(
      <Exam
        session={{ ...runningSession, remainingSeconds: 7200 / 8 }}
        fetchedAt={Date.now()}
        onSessionChange={() => {}}
      />,
    );
    await screen.findByTestId("desktop-ok");
    toastStore.push({ kind: "warning", message: "Scoring failed.", dedupeKey: "practice-grade" });
    toastStore.push({ kind: "warning", message: "Unrelated.", dedupeKey: "elsewhere" });
    expect(toastStore.list().map((t) => t.dedupeKey)).toEqual([
      "time-warning",
      "practice-grade",
      "elsewhere",
    ]);

    unmount();

    expect(toastStore.list().map((t) => t.dedupeKey)).toEqual(["elsewhere"]);
  });

  test("the Submit button is the skip link's target", async () => {
    desktop.fail = false;
    render(<Exam session={runningSession} fetchedAt={Date.now()} onSessionChange={() => {}} />);
    expect(await screen.findByRole("button", { name: "Submit exam" })).toHaveAttribute(
      "id",
      END_EXAM_BUTTON_ID,
    );
  });
});
