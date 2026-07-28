import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExamGateControls } from "./Exam";
import type { SessionSnapshot } from "../api";

const runningSession: SessionSnapshot = {
  state: "running",
  bank: "ckad-mock-01",
  startedAt: "2026-07-25T12:00:00Z",
  durationSeconds: 7200,
  remainingSeconds: 600,
  endReason: "",
  mode: "exam",
  untimed: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

// This is the control the spec singles out as existing "so nobody may be
// stranded without a way to submit" — the only submit affordance a phone
// has while the server-side clock keeps running. It had no catch, and it
// discarded {ok:false} without assignment, so both failure modes ended
// with the button flicking back to "End Exam" and nothing said: exactly
// the dead-button symptom this milestone exists to remove.
describe("ExamGateControls submit failures", () => {
  test("says why when the submit request cannot reach the facilitator", async () => {
    const user = userEvent.setup();
    const onSessionChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    render(
      <ExamGateControls
        session={runningSession}
        fetchedAt={Date.now()}
        onSessionChange={onSessionChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "End Exam" }));

    expect(await screen.findByText(/couldn't submit the exam/i)).toBeInTheDocument();
    expect(onSessionChange).not.toHaveBeenCalled();
    // The button is live again, so the message is actionable.
    expect(screen.getByRole("button", { name: "End Exam" })).not.toBeDisabled();
  });

  test("says why when the facilitator refuses the submit", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "no session is running" }), {
            status: 409,
          }),
      ),
    );

    render(
      <ExamGateControls
        session={runningSession}
        fetchedAt={Date.now()}
        onSessionChange={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "End Exam" }));

    // The facilitator's own reason survives into the message, not just a
    // generic failure.
    expect(await screen.findByText(/no session is running/)).toBeInTheDocument();
  });
});

// A real-browser pass at 600px found this: the gate rendered 0:00:00 and
// told a training candidate "the clock keeps going", because it read
// session.remainingSeconds with no untimed guard. TimerBar has that guard
// and documents exactly why ("a frozen 00:00 would read as an attempt
// that had already run out"); this path — the only one a narrowed window
// or a phone ever sees — was the one that missed it. Both existing tests
// here cover submit failures, so nothing caught it.
describe("ExamGateControls in an untimed training attempt", () => {
  const trainingSession: SessionSnapshot = {
    ...runningSession,
    mode: "training",
    untimed: true,
    // What the server actually sends for an untimed attempt.
    durationSeconds: 0,
    remainingSeconds: 0,
    startedAt: new Date(Date.now() - 90_000).toISOString(),
  };

  test("counts up instead of showing an expired-looking countdown", () => {
    render(
      <ExamGateControls
        session={trainingSession}
        fetchedAt={Date.now()}
        onSessionChange={() => {}}
      />,
    );

    expect(screen.queryByText("0:00:00")).not.toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent(/1m 3\d s?|1m \d\ds/);
    // And the screen reader is told elapsed, not remaining.
    expect(screen.getByText(/Time elapsed:/)).toBeInTheDocument();
    expect(screen.queryByText(/Time remaining:/)).not.toBeInTheDocument();
  });

  test("does not claim a clock is running out", () => {
    render(
      <ExamGateControls
        session={trainingSession}
        fetchedAt={Date.now()}
        onSessionChange={() => {}}
      />,
    );

    expect(screen.queryByText(/The clock keeps going/)).not.toBeInTheDocument();
    expect(screen.getByText(/no time limit/i)).toBeInTheDocument();
  });
});
