import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionPanel } from "./QuestionPanel";
import { desktopClipboard } from "../lib/desktopClipboard";
import { toastStore } from "./toastStore";
import type { ExamQuestionInfo } from "../api";

const questions: ExamQuestionInfo[] = [
  { id: "q01", instance: "instance-1", domain: "Config", weight: 5, totalPoints: 5 },
];

// Real bank markdown: the values a candidate must reproduce exactly are
// already marked up as inline code.
const markdown = [
  "Create a Namespace `aurora-staging` labeled `team=aurora`.",
  "",
  "Save the list to `/opt/course/1/aurora-namespaces`.",
].join("\n");

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ id: "q01", markdown }), { status: 200 })),
  );
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(async () => {}) },
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  toastStore.clear();
});

function renderPanel() {
  return render(
    <QuestionPanel
      questions={questions}
      selectedId="q01"
      onSelect={() => {}}
      open
      onToggle={() => {}}
    />,
  );
}

describe("QuestionPanel copy affordance", () => {
  test("every inline value in a question is a real button", async () => {
    renderPanel();
    // A typo in a resource name is an invisible zero, so each of these
    // has to be copyable rather than retyped.
    for (const value of ["aurora-staging", "team=aurora", "/opt/course/1/aurora-namespaces"]) {
      expect(await screen.findByRole("button", { name: new RegExp(value) })).toBeInTheDocument();
    }
  });

  test("clicking a value sends it to the exam desktop", async () => {
    const pasted: string[] = [];
    desktopClipboard.connect({ clipboardPasteFrom: (t) => void pasted.push(t) });

    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: /aurora-staging/ }));

    expect(pasted).toEqual(["aurora-staging"]);
  });

  test("a copy is confirmed, so the click isn't silent", async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: /team=aurora/ }));
    expect(toastStore.list().map((t) => t.message).join(" ")).toMatch(/copied/i);
  });

  test("the copy button is reachable and named for screen readers", async () => {
    renderPanel();
    const button = await screen.findByRole("button", { name: /aurora-staging/ });
    // The label has to say what activating it does, not just echo the value.
    expect(button).toHaveAccessibleName(/copy/i);
  });
});
