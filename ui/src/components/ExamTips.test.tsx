import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExamTips } from "./ExamTips";
import { strings } from "../strings";

const TIPS = [
  "Two hours is not long.",
  "",
  "## Set the terminal up",
  "",
  "```bash",
  "alias k=kubectl",
  "```",
  "",
  "Generate the skeleton with `--dry-run=client -o yaml`, then edit it.",
].join("\n");

function mockTips(body: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/exam/tips")) return body();
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExamTips", () => {
  test("renders the bank's markdown, not copy from this repo", async () => {
    mockTips(() => new Response(JSON.stringify({ markdown: TIPS }), { status: 200 }));

    render(<ExamTips onClose={() => {}} />);

    // The prose is the BANK's. If this ever passes against a hardcoded
    // panel, the per-bank part of the feature has been lost — a CKAD
    // sitting and a KCNA one are not made fast by the same advice.
    expect(await screen.findByText(/Two hours is not long/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Set the terminal up" })).toBeInTheDocument();
  });

  test("inline values are copyable — the page exists to save retyping them", async () => {
    mockTips(() => new Response(JSON.stringify({ markdown: TIPS }), { status: 200 }));

    render(<ExamTips onClose={() => {}} />);

    // Markdown's default (copyable) rather than the mcq `copyable={false}`
    // branch: almost every line here is a command meant to be run on the
    // exam desktop under a clock.
    expect(
      await screen.findByRole("button", { name: /--dry-run=client -o yaml/ }),
    ).toBeInTheDocument();
  });

  test("a failed fetch is recoverable rather than an empty sheet", async () => {
    let attempts = 0;
    mockTips(() => {
      attempts += 1;
      return attempts === 1
        ? new Response(JSON.stringify({ error: "no exam is loaded yet" }), { status: 503 })
        : new Response(JSON.stringify({ markdown: TIPS }), { status: 200 });
    });
    const user = userEvent.setup();

    render(<ExamTips onClose={() => {}} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/no exam is loaded yet/);

    await user.click(screen.getByRole("button", { name: strings.exams.catalogRetry }));

    await waitFor(() => expect(screen.getByText(/Two hours is not long/)).toBeInTheDocument());
  });

  test("it is a dialog, and Escape closes it", async () => {
    mockTips(() => new Response(JSON.stringify({ markdown: TIPS }), { status: 200 }));
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<ExamTips onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: strings.tips.title })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  test("the close button closes it", async () => {
    mockTips(() => new Response(JSON.stringify({ markdown: TIPS }), { status: 200 }));
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<ExamTips onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: strings.tips.done }));
    expect(onClose).toHaveBeenCalled();
  });
});
