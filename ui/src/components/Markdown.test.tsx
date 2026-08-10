import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineCode, Markdown } from "./Markdown";
import { desktopClipboard } from "../lib/desktopClipboard";
import { readThemeCss, ruleBody } from "../test/readCss";

afterEach(() => {
  vi.restoreAllMocks();
});

// The renderer is loaded through React.lazy, so the first paint of any
// <Markdown> is the Suspense fallback. Every assertion below therefore waits on
// something the renderer must have produced before it looks for what must be
// absent -- an absence assertion made against the fallback's empty div would
// pass no matter what the renderer does.

describe("Markdown", () => {
  test("inline code becomes a copy button", async () => {
    render(<Markdown>{"Label the Namespace `team=aurora` first."}</Markdown>);
    expect(await screen.findByRole("button", { name: /team=aurora/ })).toBeInTheDocument();
  });

  test("a fenced block is a code block, not a copy button", async () => {
    render(<Markdown>{"```yaml\nkind: Pod\n```"}</Markdown>);

    expect(await screen.findByText("yaml")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /kind: Pod/ })).not.toBeInTheDocument();
  });

  test("a fenced block copies its whole body to the desktop", async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(desktopClipboard, "copy").mockResolvedValue("desktop");
    render(<Markdown>{"```bash\nkubectl get pods\nkubectl get svc\n```"}</Markdown>);

    await user.click(await screen.findByRole("button", { name: /copy/i }));

    expect(copy).toHaveBeenCalledWith("kubectl get pods\nkubectl get svc");
  });

  test("a fenced block with no language still renders as a block", async () => {
    render(<Markdown>{"```\nplain listing\n```"}</Markdown>);

    expect(await screen.findByText("text")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /plain listing/ })).not.toBeInTheDocument();
  });

  test("two fenced blocks on one screen get distinguishable accessible names", async () => {
    render(
      <Markdown>
        {"```yaml\nkind: Pod\n```\n\n```bash\nkubectl get pods\n```"}
      </Markdown>,
    );

    expect(
      await screen.findByRole("button", { name: /copy yaml code block/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy bash code block/i })).toBeInTheDocument();
  });

  test("a document's own h1 renders one level down, under the app's", async () => {
    render(<Markdown>{"# Question 8 | Route two Services\n\nDo the thing."}</Markdown>);

    expect(
      await screen.findByRole("heading", { level: 2, name: /route two services/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  test("the shift keeps the rest of the ramp in order", async () => {
    render(<Markdown>{"# Title\n\n## Section\n\n### Detail"}</Markdown>);

    expect(await screen.findByRole("heading", { level: 2, name: "Title" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Section" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Detail" })).toBeInTheDocument();
  });

  test("a wide table scrolls inside itself rather than pushing the page sideways", async () => {
    render(<Markdown>{"| Name | Value |\n| --- | --- |\n| a | b |"}</Markdown>);

    const table = await screen.findByRole("table");
    expect(table.parentElement).toHaveClass("md-table-scroll");
  });

  test("copyable={false} renders inline code as a value, not a control", async () => {
    const { container } = render(
      <Markdown copyable={false}>{"Set `runAsNonRoot: true` on the container."}</Markdown>,
    );

    expect(await screen.findByText("runAsNonRoot: true")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("code")?.textContent).toBe("runAsNonRoot: true");
  });

  test("copyable={false} leaves fenced blocks alone", async () => {
    render(<Markdown copyable={false}>{"```yaml\nkind: Pod\n```"}</Markdown>);

    expect(
      await screen.findByRole("button", { name: /copy yaml code block/i }),
    ).toBeInTheDocument();
  });
});

// Bank markdown is authored content that reaches the renderer verbatim, and the
// exam tab holds the VNC session plus every piece of in-memory attempt state.
// The three properties below are what keep that tab intact. Two of them held
// only by default -- react-markdown drops raw HTML nodes because no rehype-raw
// is configured, and rewrites hostile schemes because defaultUrlTransform is
// not overridden. Adding rehype-raw or replacing that transform fails these.
describe("Markdown is a hostile-content boundary, not just a formatter", () => {
  test("raw HTML in the source never becomes an element, so a script cannot mount", async () => {
    const { container } = render(
      <Markdown>
        {[
          "Apply the manifest.",
          "",
          "<script>window.__pwned = true;</script>",
          "",
          '<img src="x" onerror="window.__pwned = true">',
          "",
          "Then verify it.",
        ].join("\n")}
      </Markdown>,
    );

    expect(await screen.findByText("Apply the manifest.")).toBeInTheDocument();
    expect(screen.getByText("Then verify it.")).toBeInTheDocument();

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();

    // Escaped to inert text rather than parsed: that is the whole of the
    // guarantee, and the only observable difference a rehype-raw pass makes.
    expect(container.textContent).toContain("<script>window.__pwned = true;</script>");
    expect(container.textContent).toContain('<img src="x" onerror="window.__pwned = true">');
  });

  test("an inline raw tag stays text without swallowing the prose around it", async () => {
    const { container } = render(
      <Markdown>{"Scale the <b>Deployment</b> to three replicas."}</Markdown>,
    );

    expect(await screen.findByText(/Scale the/)).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toBe("Scale the <b>Deployment</b> to three replicas.");
  });

  test("a javascript: href is neutralised rather than handed to the anchor", async () => {
    const { container } = render(<Markdown>{"[read the docs](javascript:alert(1))"}</Markdown>);

    expect(await screen.findByText("read the docs")).toBeInTheDocument();
    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).not.toMatch(/javascript:/i);
    expect(link?.getAttribute("href")).toBe("");
    // An emptied href is not even exposed as a link to reach by keyboard.
    expect(screen.queryByRole("link")).toBeNull();
  });

  test("a bank's link opens out of tab, so clicking it cannot discard the attempt", async () => {
    const href = "https://kubernetes.io/docs/concepts/services-networking/service/";
    render(<Markdown>{`See [the Service docs](${href}) for the field list.`}</Markdown>);

    const link = await screen.findByRole("link", { name: "the Service docs" });
    expect(link).toHaveAttribute("href", href);
    // Without target="_blank" this click replaces the document that owns the
    // VNC session and the unsaved attempt state. rel closes the two doors that
    // opening a new context otherwise leaves ajar.
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("the anchor is hardened on the static variant too, not only the copyable one", async () => {
    render(<Markdown copyable={false}>{"[the Service docs](https://kubernetes.io/docs/)"}</Markdown>);

    const link = await screen.findByRole("link", { name: "the Service docs" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
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
