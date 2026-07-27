import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Markdown } from "./Markdown";
import { desktopClipboard } from "../lib/desktopClipboard";
import { readThemeCss } from "../test/readCss";

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

  test("two fenced blocks on one screen get distinguishable accessible names", () => {
    render(
      <Markdown>
        {"```yaml\nkind: Pod\n```\n\n```bash\nkubectl get pods\n```"}
      </Markdown>,
    );
    // Fix round 1: the copy button used to be named the static "Copy" for
    // every block, so a screen reader user with two listings on screen
    // heard two identically-named buttons. The language differentiates
    // them while the visible label stays the terse "Copy".
    expect(screen.getByRole("button", { name: /copy yaml code block/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy bash code block/i })).toBeInTheDocument();
  });

  // Bank content is authored standalone: every question.md opens
  // "# Question N | ..." and every solution.md opens "# Solution N". Left
  // at h1 that is a second h1 on the exam screen (the topbar owns one) and
  // an h1 nested two <details> deep on the score screen. The whole ramp
  // shifts down one so the bank stays a document and the app stays one
  // outline.
  test("a document's own h1 renders one level down, under the app's", () => {
    render(<Markdown>{"# Question 8 | Route two Services\n\nDo the thing."}</Markdown>);
    expect(
      screen.getByRole("heading", { level: 2, name: /route two services/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  test("the shift keeps the rest of the ramp in order", () => {
    render(<Markdown>{"# Title\n\n## Section\n\n### Detail"}</Markdown>);
    expect(screen.getByRole("heading", { level: 2, name: "Title" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Section" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Detail" })).toBeInTheDocument();
  });

  test("a wide table scrolls inside itself rather than pushing the page sideways", () => {
    const { container } = render(
      <Markdown>{"| Name | Value |\n| --- | --- |\n| a | b |"}</Markdown>,
    );
    const table = container.querySelector("table");
    expect(table?.parentElement).toHaveClass("md-table-scroll");
  });
});

describe("Markdown wrapper: pane layout and prose styling do not share a class", () => {
  // Fix round 1: QuestionPanel's own wrapper div and Markdown's wrapper
  // div were both classed `.md`, nesting `.md` inside `.md`. `.md` carried
  // pane layout (flex/overflow-y/padding) meant for QuestionPanel's scroll
  // region, so the inner (Markdown's own) wrapper picked up that padding
  // a second time, and Task 8's `.solution-details` call site — which has
  // no pane ancestor — would inherit an unwanted padding box with nothing
  // to pair it with. The fix moves pane layout onto its own
  // `.question-pane` selector, used only on QuestionPanel's wrapper, and
  // leaves `.md` prose-only so `<Markdown>` is a self-contained drop-in
  // anywhere.
  //
  // jsdom does not run layout or apply an unlinked stylesheet, so the
  // doubled-padding regression itself (a rendered pixel value) cannot be
  // observed here. What *is* expressible without a browser: (a) Markdown's
  // own wrapper never carries the pane-layout class, and (b) the
  // stylesheet itself never re-merges pane layout back onto `.md`. Together
  // these fail if the two concerns are recombined onto one selector, which
  // is the actual regression being pinned.

  test("Markdown's own wrapper carries the prose class only, never pane layout", () => {
    const { container } = render(<Markdown>{"hello"}</Markdown>);
    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass("md");
    expect(wrapper).not.toHaveClass("question-pane");
  });

  test("theme.css keeps pane layout off .md and prose rules off .question-pane", async () => {
    const css = await readThemeCss();

    // `.md` on its own (not `.md pre` / `.md code`) has no declaration
    // block at all today — the class exists purely so those descendant
    // selectors can target it. If a bare `.md { ... }` rule ever
    // reappears, it must not be pane layout: that was exactly the
    // regression (flex/overflow-y/padding riding along with `.md`,
    // doubling up wherever Markdown's own wrapper nested inside
    // QuestionPanel's).
    const bareMdRule = /(?:^|\n)\.md\s*\{([^}]*)\}/.exec(css);
    if (bareMdRule) {
      expect(bareMdRule[1]).not.toMatch(/flex:/);
      expect(bareMdRule[1]).not.toMatch(/overflow-y:/);
    }

    // Prose selectors stay scoped under `.md`.
    expect(css).toMatch(/(?:^|\n)\.md pre\s*\{/);
    expect(css).toMatch(/(?:^|\n)\.md code\s*\{/);
    expect(css).toMatch(/(?:^|\n)\.md pre code\s*\{/);

    // Pane layout lives on its own selector, used only by QuestionPanel,
    // and carries no prose rules of its own.
    const paneRule = /(?:^|\n)\.question-pane\s*\{([^}]*)\}/.exec(css);
    expect(paneRule).not.toBeNull();
    expect(paneRule![1]).toMatch(/flex:\s*1/);
    expect(paneRule![1]).toMatch(/overflow-y:\s*auto/);
    expect(paneRule![1]).not.toMatch(/\bpre\b|\bcode\b/);
  });
});
