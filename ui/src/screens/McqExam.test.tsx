import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { McqExam } from "./McqExam";
import { marksStore } from "../components/marksStore";
import { toastStore } from "../components/toastStore";
import type { SessionSnapshot } from "../api";

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

// Stubs every endpoint the screen touches and logs writes, so tests can
// assert exactly what was PUT where. Answer PUTs echo the selection
// back sorted, matching the real handler.
function stubFetch(stored: Record<string, number[]> = {}, failPut = false) {
  const log: FetchLogEntry[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      log.push({ url, method, body });

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

afterEach(() => {
  vi.unstubAllGlobals();
  toastStore.clear();
  marksStore.reset();
});

describe("McqExam answering", () => {
  test("selecting an option PUTs it and marks the tile answered", async () => {
    const log = stubFetch();
    const user = userEvent.setup();
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    await user.click(await screen.findByRole("checkbox", { name: /etcd/ }));

    await waitFor(() => {
      const put = log.find((e) => e.method === "PUT");
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
      const puts = log.filter((e) => e.method === "PUT");
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
      const put = log.find((e) => e.method === "PUT");
      expect(put?.body).toEqual({ selected: [] });
    });
    expect(option).not.toBeChecked();
  });

  test("multi-select accumulates selections", async () => {
    const log = stubFetch();
    const user = userEvent.setup();
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    // Step to the multi question.
    await screen.findByText("Which component persists cluster state?");
    await user.click(screen.getByRole("button", { name: /next question/i }));
    await user.click(await screen.findByRole("checkbox", { name: /CRI/ }));
    await user.click(screen.getByRole("checkbox", { name: /CNI/ }));

    await waitFor(() => {
      const puts = log.filter((e) => e.method === "PUT");
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

    // 409 → revert to unanswered, toast raised. Nothing may pretend the
    // click was recorded.
    await waitFor(() => expect(option).not.toBeChecked());
    expect(toastStore.list().length).toBeGreaterThan(0);
  });

  test("submit dialog counts unanswered questions from server state", async () => {
    stubFetch({ q01: [1] });
    const user = userEvent.setup();
    render(<McqExam session={session} fetchedAt={Date.now()} onSessionChange={() => {}} />);

    await screen.findByText("Which component persists cluster state?");
    await user.click(screen.getByRole("button", { name: /end exam/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/1 question is unanswered/)).toBeInTheDocument();
    expect(screen.getByText("q02", { selector: ".submit-review-ids" })).toBeInTheDocument();
  });
});
