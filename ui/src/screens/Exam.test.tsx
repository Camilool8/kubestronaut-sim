import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Exam, ExamGateControls } from "./Exam";
import type { SessionSnapshot } from "../api";
import { clipboardSync } from "../lib/clipboardSync";
import { marksStore } from "../components/marksStore";
import { toastStore } from "../components/toastStore";

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
  toastStore.clear();
  marksStore.reset();
  window.sessionStorage.clear();
});

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

    await user.click(screen.getByRole("button", { name: "Submit exam" }));

    expect(await screen.findByText(/couldn't submit the exam/i)).toBeInTheDocument();
    expect(onSessionChange).not.toHaveBeenCalled();

    expect(screen.getByRole("button", { name: "Submit exam" })).not.toBeDisabled();
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

    await user.click(screen.getByRole("button", { name: "Submit exam" }));

    expect(await screen.findByText(/no session is running/)).toBeInTheDocument();
  });
});

describe("ExamGateControls in an untimed training attempt", () => {
  const trainingSession: SessionSnapshot = {
    ...runningSession,
    mode: "training",
    untimed: true,

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

describe("Exam clipboard sync wiring", () => {
  const idleSession: SessionSnapshot = {
    ...runningSession,
    state: "idle",
  };

  function stubExamFetch() {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ title: "CKAD Mock Exam 01", questions: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
  }

  test("starts clipboard sync on mount and stops it on unmount", async () => {
    stubExamFetch();
    const startSpy = vi.spyOn(clipboardSync, "start").mockImplementation(() => {});
    const stopSpy = vi.spyOn(clipboardSync, "stop").mockImplementation(() => {});

    try {
      const { unmount } = render(
        <Exam session={idleSession} fetchedAt={Date.now()} onSessionChange={() => {}} />,
      );

      await vi.waitFor(() => expect(startSpy).toHaveBeenCalledTimes(1));
      expect(stopSpy).not.toHaveBeenCalled();

      unmount();

      expect(stopSpy).toHaveBeenCalledTimes(1);
    } finally {
      startSpy.mockRestore();
      stopSpy.mockRestore();
    }
  });
});

describe("Exam topbar and focus reporting", () => {
  const idleSession: SessionSnapshot = { ...runningSession, state: "idle" };

  const exam = {
    name: "ckad-mock-01",
    title: "CKAD Mock Exam 01",
    examType: "hands-on",
    durationSeconds: 7200,
    passingScore: 66,
    kubernetesVersion: "1.35",
    questionCount: 2,
    questions: [
      {
        id: "q01",
        title: "Namespaces & quotas",
        instance: "instance-1",
        domain: "Config",
        weight: 9,
        totalPoints: 9,
        hintCount: 0,
      },
      {
        id: "q02",
        title: "Expose a Deployment",
        instance: "instance-2",
        domain: "Networking",
        weight: 9,
        totalPoints: 9,
        hintCount: 0,
      },
    ],
  };

  interface Call {
    url: string;
    method: string;
    body: unknown;
  }

  function stubFetch(focusStatus = 200) {
    const calls: Call[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (url.includes("/api/session/focus")) {
          return new Response(focusStatus === 200 ? "{}" : JSON.stringify({ error: "no route" }), {
            status: focusStatus,
          });
        }
        const payload = url.includes("/api/exam")
          ? exam
          : { id: "q01", markdown: "Create a Namespace `aurora-staging`." };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    return calls;
  }

  test("the topbar names the cluster and the boxes the drawn tasks are graded on", async () => {
    stubFetch();
    render(<Exam session={idleSession} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    const env = await screen.findByText(/Kubernetes 1\.35/);
    expect(env).toHaveTextContent("instance-1, instance-2");
    expect(env).toHaveTextContent(/reachable over ssh/);
  });

  test("progress counts what was OPENED, never what was answered", async () => {
    stubFetch();
    render(<Exam session={idleSession} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    expect(await screen.findByText(/1 of 2 opened/)).toBeInTheDocument();
    expect(screen.queryByText(/answered/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/complete/i)).not.toBeInTheDocument();
  });

  test("the task on screen is reported to the server, once, and again on a step", async () => {
    const calls = stubFetch();
    const user = userEvent.setup();
    render(<Exam session={idleSession} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    await screen.findByRole("button", { name: /next question/i });
    await vi.waitFor(() => {
      const focus = calls.filter((c) => c.url === "/api/session/focus");
      expect(focus).toHaveLength(1);
      expect(focus[0].method).toBe("PUT");
      expect(focus[0].body).toEqual({ question: "q01" });
    });

    await user.click(screen.getByRole("button", { name: /next question/i }));

    await vi.waitFor(() => {
      const focus = calls.filter((c) => c.url === "/api/session/focus");
      expect(focus[focus.length - 1]?.body).toEqual({ question: "q02" });
    });
  });

  test("a facilitator with no focus route changes nothing on screen", async () => {
    stubFetch(404);
    render(<Exam session={idleSession} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    expect(await screen.findByText("Namespaces & quotas")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(toastStore.list()).toHaveLength(0);
  });

  test("Submit exam is in the bar, not behind the menu", async () => {
    render(<Exam session={runningSession} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    const submit = await screen.findByRole("button", { name: "Submit exam" });
    expect(submit).toBeInTheDocument();

    // The menu panel only mounts when open (NavMenu.tsx:42), so if the
    // button were still a menu item it could not be found while closed.
    expect(screen.queryByRole("group", { name: "Menu" })).not.toBeInTheDocument();
  });
});
