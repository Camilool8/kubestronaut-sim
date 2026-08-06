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

    expect(screen.getByRole("button", { name: /copy yaml code block/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy bash code block/i })).toBeInTheDocument();
  });

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

  test("copyable={false} renders inline code as a value, not a control", () => {
    const { container } = render(
      <Markdown copyable={false}>{"Set `runAsNonRoot: true` on the container."}</Markdown>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("code")?.textContent).toBe("runAsNonRoot: true");
  });

  test("copyable={false} leaves fenced blocks alone", () => {
    render(<Markdown copyable={false}>{"```yaml\nkind: Pod\n```"}</Markdown>);

    expect(screen.getByRole("button", { name: /copy yaml code block/i })).toBeInTheDocument();
  });
});

describe("InlineCode", () => {
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

  test("an unpaired backtick renders as the literal it is", () => {
    const { container } = render(<InlineCode text="90% of `nodes" />);
    expect(container.textContent).toBe("90% of `nodes");
    expect(container.querySelector("code")).toBeNull();
  });

  test("renders no interactive element", () => {
    render(<InlineCode text="Use `kubectl debug` to attach a container" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("the copyable value announces itself at rest", () => {
  test("inline code carries a fill AND an edge, so it survives any surface", async () => {
    const body = ruleBody(await readThemeCss(), ".md code, .mcq-option-text code");
    expect(body).not.toBeNull();

    expect(body).not.toMatch(/background:\s*var\(--bg\)/);
    expect(body).toMatch(/background:\s*var\(--surface-raised\)/);
    expect(body).toMatch(/border:\s*1px solid var\(--border\)/);
  });

  test("a copyable value's resting edge marks it as a control", async () => {
    const body = ruleBody(await readThemeCss(), ".copy-value code");
    expect(body).not.toBeNull();

    expect(body).toMatch(/border-color:\s*var\(--border-strong\)/);
    expect(body).not.toMatch(/transparent/);
  });

  test("there is no out-of-flow hover icon to collide with the next word", async () => {
    const css = await readThemeCss();

    expect(ruleBody(css, ".copy-value-icon")).toBeNull();
    expect(css).not.toContain("copy-value-icon");
  });

  test("a long value wraps inside its chip rather than pushing the pane sideways", async () => {
    const body = ruleBody(await readThemeCss(), ".copy-value code");
    expect(body).toMatch(/overflow-wrap:\s*anywhere/);
  });
});

describe("Markdown wrapper: pane layout and prose styling do not share a class", () => {
  test("Markdown's own wrapper carries the prose class only, never pane layout", () => {
    const { container } = render(<Markdown>{"hello"}</Markdown>);
    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass("md");
    expect(wrapper).not.toHaveClass("question-pane");
  });

  test("theme.css keeps pane layout off .md and prose rules off .question-pane", async () => {
    const css = await readThemeCss();

    const bareMdRule = /(?:^|\n)\.md\s*\{([^}]*)\}/.exec(css);
    if (bareMdRule) {
      expect(bareMdRule[1]).not.toMatch(/flex:/);
      expect(bareMdRule[1]).not.toMatch(/overflow-y:/);
    }

    expect(css).toMatch(/(?:^|\n)\.md pre\s*\{/);
    expect(css).toMatch(/(?:^|\n)\.md code\s*[,{]/);
    expect(css).toMatch(/(?:^|\n)\.md pre code\s*\{/);

    const paneRule = /(?:^|\n)\.question-pane\s*\{([^}]*)\}/.exec(css);
    expect(paneRule).not.toBeNull();
    expect(paneRule![1]).toMatch(/flex:\s*1/);
    expect(paneRule![1]).toMatch(/overflow-y:\s*auto/);
    expect(paneRule![1]).not.toMatch(/\bpre\b|\bcode\b/);
  });
});
