import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Markdown } from "./Markdown";
import { strings } from "../strings";

const { renderer } = vi.hoisted(() => ({ renderer: { fail: true } }));

vi.mock("./MarkdownRenderer", () => ({
  default: ({ children }: { children: string }) => {
    if (renderer.fail) throw new Error("Failed to fetch dynamically imported module");
    return <div data-testid="rendered">{children}</div>;
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Markdown when its renderer cannot load", () => {
  test("the task text stays readable as plain text, and Try again renders it properly", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const task = "Create a Namespace `aurora-staging`.";
    render(<Markdown>{task}</Markdown>);

    expect(await screen.findByText(strings.paneError.markdownTitle)).toBeInTheDocument();
    expect(screen.getByText(task)).toBeInTheDocument();

    renderer.fail = false;
    await user.click(screen.getByRole("button", { name: strings.paneError.retry }));
    expect(await screen.findByTestId("rendered")).toHaveTextContent(task);
  });
});
