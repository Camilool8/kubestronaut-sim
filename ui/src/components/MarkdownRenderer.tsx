import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type MarkdownComponents = ComponentProps<typeof ReactMarkdown>["components"];

const PLUGINS = [remarkGfm];

export default function MarkdownRenderer({
  components,
  children,
}: {
  components: MarkdownComponents;
  children: string;
}) {
  return (
    <ReactMarkdown components={components} remarkPlugins={PLUGINS}>
      {children}
    </ReactMarkdown>
  );
}
