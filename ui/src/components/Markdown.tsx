import type { ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { desktopClipboard } from "../lib/desktopClipboard";
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
function CopyableCode({ children }: { children: ReactNode }) {
  const value = typeof children === "string" ? children : String(children ?? "");

  const copy = async () => {
    const outcome = await desktopClipboard.copy(value);
    toastStore.push({
      kind: outcome === "failed" ? "warning" : "info",
      message:
        outcome === "desktop"
          ? strings.questionPanel.copiedToDesktop(value)
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
      <span className="copy-value-icon" aria-hidden="true">
        ⧉
      </span>
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
          ? strings.markdown.copiedBlockToDesktop
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

const COMPONENTS = {
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
  code: ({ children, className }: CodeChildProps) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <CopyableCode>{children}</CopyableCode>
    ),
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown components={COMPONENTS}>{children}</ReactMarkdown>
    </div>
  );
}
