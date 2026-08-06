import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HintTray } from "./HintTray";

function stub(handler: (url: string) => Response) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => handler(String(input))));
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("HintTray", () => {
  test("reveals hints one tier at a time", async () => {
    const user = userEvent.setup();
    stub((url) => {
      if (url.endsWith("/hints/1")) {
        return json({ id: "q01", tier: 1, total: 2, markdown: "check the selector" });
      }
      if (url.endsWith("/hints/2")) {
        return json({ id: "q01", tier: 2, total: 2, markdown: "spec.selector vs pod labels" });
      }
      return json({ id: "q01", markdown: "the full walkthrough" });
    });

    render(<HintTray questionId="q01" hintCount={2} />);

    expect(screen.queryByText("check the selector")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show solution" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show hint 1 of 2" }));
    expect(await screen.findByText("check the selector")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Show solution" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show hint 2 of 2" }));
    expect(await screen.findByText("spec.selector vs pod labels")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show solution" }));
    expect(await screen.findByText("the full walkthrough")).toBeInTheDocument();
  });

  test("surfaces a refusal without throwing", async () => {
    const user = userEvent.setup();
    stub(() => json({ error: "hints are available in Training mode only" }, 403));

    render(<HintTray questionId="q01" hintCount={2} />);
    await user.click(screen.getByRole("button", { name: "Show hint 1 of 2" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Training mode/i);
  });
});
