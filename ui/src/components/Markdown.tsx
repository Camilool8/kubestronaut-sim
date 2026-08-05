import type { ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { desktopClipboard } from "../lib/desktopClipboard";
import { pasteChordLabel } from "../lib/desktopKeymap";
import { highlightTo } from "../lib/highlight";
import { strings } from "../strings";
import { toastStore } from "./toastStore";

// The single markdown renderer for the app. Questions and solutions come
// from the same bank files and must read identically; before this existed
// they had two renderers and only the question one was finished, so
// solutions rendered unstyled and overflowed the page sideways.

// Bank questions mark every value a candidate must reproduce exactly —
// resource names, labels, image tags, /opt/course paths — as inline code.
// Rendering those as buttons turns "retype this without a typo" into one
// click, and the click pushes the value into the exam desktop's clipboard.
//
// Only where there IS a desktop. See the `copyable` prop below.
function CopyableCode({ children }: { children: ReactNode }) {
  const value = typeof children === "string" ? children : String(children ?? "");

  const copy = async () => {
    const outcome = await desktopClipboard.copy(value);
    toastStore.push({
      kind: outcome === "failed" ? "warning" : "info",
      message:
        outcome === "desktop"
          ? strings.questionPanel.copiedToDesktop(value, pasteChordLabel())
          : outcome === "browser"
            ? strings.questionPanel.copied(value)
            : strings.questionPanel.copyFailed,
      dedupeKey: "copy-value",
    });
  };

  return (
    <button
      type="button"
      className="copy-value"
      onClick={copy}
      aria-label={strings.questionPanel.copyValue(value)}
    >
      <code>{children}</code>
    </button>
  );
}

// A fenced listing: language chip, one copy control for the whole body, and
// a pre that scrolls inside itself rather than pushing the page sideways.
function CodeBlock({ className, children }: { className?: string; children?: ReactNode }) {
  const language = /language-(\w+)/.exec(className ?? "")?.[1] ?? "";
  const displayLanguage = language || strings.markdown.plainLanguage;
  const body = String(children ?? "").replace(/\n$/, "");

  const copy = async () => {
    const outcome = await desktopClipboard.copy(body);
    toastStore.push({
      kind: outcome === "failed" ? "warning" : "info",
      message:
        outcome === "desktop"
          ? strings.markdown.copiedBlockToDesktop(pasteChordLabel())
          : outcome === "browser"
            ? strings.markdown.copiedBlock
            : strings.markdown.copyFailed,
      dedupeKey: "copy-block",
    });
  };

  // Renders plain first, then swaps in highlighted markup once the grammar
  // resolves. Same font, size and spacing either way, so nothing moves.
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    highlightTo(language, body).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => {
      cancelled = true;
    };
  }, [language, body]);

  return (
    <figure className="code-block">
      <figcaption className="code-block-head">
        <span className="code-block-lang">{displayLanguage}</span>
        {/* A screen reader with several fenced blocks on one screen needs
            more than "Copy" repeated — the language is the one thing that
            tells them apart, so it goes in the accessible name while the
            visible label stays the terse "Copy". */}
        <button
          type="button"
          className="code-block-copy"
          onClick={copy}
          aria-label={strings.markdown.copyBlockLabel(displayLanguage)}
        >
          {strings.markdown.copyBlock}
        </button>
      </figcaption>
      <pre>
        {html === null ? (
          <code className={className}>{body}</code>
        ) : (
          <code className={className} dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </pre>
    </figure>
  );
}

interface CodeChildProps {
  className?: string;
  children?: ReactNode;
}

const SHARED_COMPONENTS = {
  // Bank content is authored as a standalone document: every question.md
  // opens `# Question 8 | ...` and every solution.md opens `# Solution 8`.
  // Dropped into the app as-is that is a second h1 on the exam screen —
  // the topbar already owns one — and an h1 nested two <details> deep on
  // the score screen. Shifting the whole ramp down one level lets the bank
  // stay a document and the app stay one outline. h6 has nowhere to go and
  // stays put; nothing in the banks reaches past h3.
  h1: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  h2: ({ children }: { children?: ReactNode }) => <h3>{children}</h3>,
  h3: ({ children }: { children?: ReactNode }) => <h4>{children}</h4>,
  h4: ({ children }: { children?: ReactNode }) => <h5>{children}</h5>,
  h5: ({ children }: { children?: ReactNode }) => <h6>{children}</h6>,
  h6: ({ children }: { children?: ReactNode }) => <h6>{children}</h6>,
  // A bare <table> would scroll the page rather than itself. The wrapper
  // is what carries the Scroll-Inside Rule. (Tables need remark-gfm to
  // exist at all — see the plugin list below.)
  table: ({ children }: { children?: ReactNode }) => (
    <div className="md-table-scroll">
      <table>{children}</table>
    </div>
  ),
  // react-markdown routes fenced blocks through `code` too, and a fenced
  // block with no language has no className — indistinguishable from
  // inline code at that level. Overriding `pre` instead and reading the
  // child's props is what keeps a language-less listing from collapsing
  // into a single copy button.
  pre: ({ children }: { children?: ReactNode }) => {
    const child = (Array.isArray(children) ? children[0] : children) as
      | ReactElement<CodeChildProps>
      | undefined;
    return (
      <CodeBlock className={child?.props?.className}>{child?.props?.children}</CodeBlock>
    );
  },
};

// Two component maps, built once at module scope rather than per render:
// react-markdown re-renders its whole tree when the object identity
// changes, and the exam screen re-renders on every clock tick.
const COMPONENTS = {
  ...SHARED_COMPONENTS,
  code: ({ children, className }: CodeChildProps) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <CopyableCode>{children}</CopyableCode>
    ),
};

const COMPONENTS_STATIC = {
  ...SHARED_COMPONENTS,
  code: ({ children, className }: CodeChildProps) => <code className={className}>{children}</code>,
};

// Eight solution files in the CKAD bank are written with GFM pipe tables
// ("| Field | Default | Why the question pins it |"). react-markdown parses
// CommonMark only, so until this plugin landed every one of them rendered
// as literal rows of pipe characters on the score screen — the surface a
// candidate reads to find out why they lost points. The plugin is bundled
// like everything else; the exam must not depend on the network.
const PLUGINS = [remarkGfm];

/**
 * `copyable` decides whether an inline value is a button or just a value.
 *
 * It is true for the hands-on engine, where the click pushes into the
 * exam desktop's clipboard and saves the candidate retyping a path under
 * a clock. It is false for multiple choice, which has no desktop and no
 * terminal — an mcq attempt starts before the cluster is up and works on
 * a phone, so a copy button there offers a paste target that does not
 * exist. The chip looks the same either way; only the promise differs.
 */
export function Markdown({
  children,
  copyable = true,
}: {
  children: string;
  copyable?: boolean;
}) {
  return (
    <div className="md">
      <ReactMarkdown
        components={copyable ? COMPONENTS : COMPONENTS_STATIC}
        remarkPlugins={PLUGINS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Inline code for text that is NOT markdown: an mcq option.
 *
 * Options are single-line strings in exam.yaml and bank-spec.md has
 * always promised that "inline markdown such as backticks is fine" in
 * them. It was not: both option renderers interpolated the raw string, so
 * the 44 backticked spans in the KCNA bank reached the candidate with
 * their backticks showing.
 *
 * Deliberately not <Markdown>. An option is the label of a radio or
 * checkbox, and Markdown would wrap it in a <p> and — with copy enabled —
 * nest a <button> inside that <label>, which is invalid HTML and takes
 * the click away from the option itself. So: backticks and nothing else.
 */
export function InlineCode({ text }: { text: string }) {
  // Odd indices are the spans between backticks — but only once the
  // backticks are known to pair up. An odd COUNT of them leaves the final
  // span unterminated, and treating it as code would silently restyle the
  // rest of the option and eat the character that was the actual mistake.
  // A typo in a bank should show as the typo it is, so the unterminated
  // tail is folded back into the preceding text with its backtick intact.
  const parts = text.split("`");
  if (parts.length % 2 === 0) {
    const tail = parts.pop() as string;
    parts[parts.length - 1] += "`" + tail;
  }
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <code key={i}>{part}</code> : <span key={i}>{part}</span>,
      )}
    </>
  );
}
