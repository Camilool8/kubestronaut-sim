import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Markdown } from "./Markdown";
import { desktopClipboard } from "../lib/desktopClipboard";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Markdown", () => {
  test("inline code becomes a copy button", () => {
    render(<Markdown>{"Label the Namespace `team=aurora` first."}</Markdown>);
    expect(screen.getByRole("button", { name: /team=aurora/ })).toBeInTheDocument();
  });

  test("a fenced block is a code block, not a copy button", () => {
    render(<Markdown>{"```yaml\nkind: Pod\n```"}</Markdown>);
    // The whole listing must not collapse into one giant button.
    expect(screen.queryByRole("button", { name: /kind: Pod/ })).not.toBeInTheDocument();
    expect(screen.getByText("yaml")).toBeInTheDocument();
  });

  test("a fenced block copies its whole body to the desktop", async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(desktopClipboard, "copy").mockResolvedValue("desktop");
    render(<Markdown>{"```bash\nkubectl get pods\nkubectl get svc\n```"}</Markdown>);

    await user.click(screen.getByRole("button", { name: /copy/i }));

    expect(copy).toHaveBeenCalledWith("kubectl get pods\nkubectl get svc");
  });

  test("a fenced block with no language still renders as a block", () => {
    render(<Markdown>{"```\nplain listing\n```"}</Markdown>);
    expect(screen.queryByRole("button", { name: /plain listing/ })).not.toBeInTheDocument();
    expect(screen.getByText("text")).toBeInTheDocument();
  });
});
