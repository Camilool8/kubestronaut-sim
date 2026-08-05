import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineCode, Markdown } from "./Markdown";
import { desktopClipboard } from "../lib/desktopClipboard";
import { readThemeCss, ruleBody } from "../test/readCss";

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

  // An mcq attempt has no desktop and no terminal — it starts before the
  // cluster is up and works on a phone — so a copy button there promises a
  // paste target that does not exist.
  test("copyable={false} renders inline code as a value, not a control", () => {
    const { container } = render(
      <Markdown copyable={false}>{"Set `runAsNonRoot: true` on the container."}</Markdown>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("code")?.textContent).toBe("runAsNonRoot: true");
  });

  test("copyable={false} leaves fenced blocks alone", () => {
    render(<Markdown copyable={false}>{"```yaml\nkind: Pod\n```"}</Markdown>);
    // The block's own copy control is a separate affordance with a real
    // slot for itself, and it survives.
    expect(screen.getByRole("button", { name: /copy yaml code block/i })).toBeInTheDocument();
  });
});

describe("InlineCode", () => {
  // bank-spec.md has always promised that "inline markdown such as
  // backticks is fine" in an mcq option. It was not: both option
  // renderers interpolated the raw string, so the 44 backticked spans in
  // the KCNA bank reached the candidate with their backticks showing.
  test("backticked spans become code, and the backticks do not survive", () => {
    const { container } = render(<InlineCode text="Setting `hostNetwork: true` in the pod spec" />);
    const code = container.querySelector("code");
    expect(code?.textContent).toBe("hostNetwork: true");
    expect(container.textContent).toBe("Setting hostNetwork: true in the pod spec");
    expect(container.textContent).not.toContain("`");
  });

  test("an option with no backticks is unchanged", () => {
    const { container } = render(<InlineCode text="The kube-scheduler" />);
    expect(container.querySelector("code")).toBeNull();
    expect(container.textContent).toBe("The kube-scheduler");
  });

  // A stray backtick is an authoring typo in a bank, not a reason to eat
  // the rest of the option.
  test("an unpaired backtick renders as the literal it is", () => {
    const { container } = render(<InlineCode text="90% of `nodes" />);
    expect(container.textContent).toBe("90% of `nodes");
    expect(container.querySelector("code")).toBeNull();
  });

  // An option is the label of a checkbox. Rendering it through Markdown
  // would nest a <button> inside that <label> — invalid HTML, and it
  // takes the click away from the option itself.
  test("renders no interactive element", () => {
    render(<InlineCode text="Use `kubectl debug` to attach a container" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("the copyable value announces itself at rest", () => {
  // jsdom has no CSS engine, so these read the stylesheet. They exist
  // because nothing pinned this component's geometry before, and three
  // separate hover-icon geometries were tried and reverted without a
  // single test noticing.

  test("inline code carries a fill AND an edge, so it survives any surface", async () => {
    const body = ruleBody(await readThemeCss(), ".md code, .mcq-option-text code");
    expect(body).not.toBeNull();
    // The fill used to be --bg, which is exactly what .mcq-body is: on the
    // multiple-choice screen the chip was invisible until hovered.
    expect(body).not.toMatch(/background:\s*var\(--bg\)/);
    expect(body).toMatch(/background:\s*var\(--surface-raised\)/);
    expect(body).toMatch(/border:\s*1px solid var\(--border\)/);
  });

  test("a copyable value's resting edge marks it as a control", async () => {
    const body = ruleBody(await readThemeCss(), ".copy-value code");
    expect(body).not.toBeNull();
    // DESIGN.md's Two-Tier Hairline rule: --border-strong is for an edge
    // that identifies a hit area. This was `1px solid transparent`, which
    // is how the affordance came to be discoverable only by hovering.
    expect(body).toMatch(/border-color:\s*var\(--border-strong\)/);
    expect(body).not.toMatch(/transparent/);
  });

  test("there is no out-of-flow hover icon to collide with the next word", async () => {
    const css = await readThemeCss();
    // At the mcq stem's 19px the absolutely-positioned icon ran ~18px past
    // its chip into a ~4px word gap, and the next chip's opaque fill
    // painted over it. The chip itself is the whole control now.
    expect(ruleBody(css, ".copy-value-icon")).toBeNull();
    expect(css).not.toContain("copy-value-icon");
  });

  test("a long value wraps inside its chip rather than pushing the pane sideways", async () => {
    const body = ruleBody(await readThemeCss(), ".copy-value code");
    expect(body).toMatch(/overflow-wrap:\s*anywhere/);
  });
});

describe("Markdown wrapper: pane layout and prose styling do not share a class", () => {
  // Fix round 1: QuestionPanel's own wrapper div and Markdown's wrapper
  // div were both classed `.md`, nesting `.md` inside `.md`. `.md` carried
  // pane layout (flex/overflow-y/padding) meant for QuestionPanel's scroll
  // region, so the inner (Markdown's own) wrapper picked up that padding
  // a second time, and a `.solution-details` call site with no pane
  // ancestor — the score screen's verdict rows then, McqExam's
  // training-mode check-answer now that the deep dive owns the reference
  // solution — would inherit an unwanted padding box with nothing to
  // pair it with. The fix moves pane layout onto its own
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

    // Prose selectors stay scoped under `.md`. The inline-code rule now
    // shares its block with `.mcq-option-text code` — an option is not
    // markdown but its code spans are the same object — so the selector
    // may be followed by a comma as well as by its brace.
    expect(css).toMatch(/(?:^|\n)\.md pre\s*\{/);
    expect(css).toMatch(/(?:^|\n)\.md code\s*[,{]/);
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
