import type { ReactElement, ReactNode } from "react";
import { Suspense, lazy, useEffect, useState } from "react";
import type { MarkdownComponents } from "./MarkdownRenderer";
import { desktopClipboard } from "../lib/desktopClipboard";
import { pasteChordLabel } from "../lib/desktopKeymap";
import { highlightTo } from "../lib/highlight";
import { strings } from "../strings";
import { toastStore } from "./toastStore";

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
  // A bank author's `[label](https://…)` must never replace the exam document:
  // the tab holds the VNC session and every piece of in-memory attempt state,
  // and a same-tab navigation destroys the running attempt. Opening out of tab
  // also makes the new context opener-less and referrer-less, matching the
  // hardening on the other two link paths (Explain.tsx, DocsTray.tsx).
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),

  h1: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  h2: ({ children }: { children?: ReactNode }) => <h3>{children}</h3>,
  h3: ({ children }: { children?: ReactNode }) => <h4>{children}</h4>,
  h4: ({ children }: { children?: ReactNode }) => <h5>{children}</h5>,
  h5: ({ children }: { children?: ReactNode }) => <h6>{children}</h6>,
  h6: ({ children }: { children?: ReactNode }) => <h6>{children}</h6>,

  table: ({ children }: { children?: ReactNode }) => (
    <div className="md-table-scroll">
      <table>{children}</table>
    </div>
  ),

  pre: ({ children }: { children?: ReactNode }) => {
    const child = (Array.isArray(children) ? children[0] : children) as
      | ReactElement<CodeChildProps>
      | undefined;
    return (
      <CodeBlock className={child?.props?.className}>{child?.props?.children}</CodeBlock>
    );
  },
};

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

const MarkdownRenderer = lazy(() => import("./MarkdownRenderer"));

export function Markdown({
  children,
  copyable = true,
}: {
  children: string;
  copyable?: boolean;
}) {
  const components: MarkdownComponents = copyable ? COMPONENTS : COMPONENTS_STATIC;
  return (
    <div className="md">
      <Suspense fallback={null}>
        <MarkdownRenderer components={components}>{children}</MarkdownRenderer>
      </Suspense>
    </div>
  );
}

export function InlineCode({ text }: { text: string }) {
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
