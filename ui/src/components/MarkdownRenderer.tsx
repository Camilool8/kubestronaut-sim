import { useMemo, type ComponentProps } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Heading, Root } from "mdast";

export type MarkdownComponents = ComponentProps<typeof ReactMarkdown>["components"];

interface TreeNode {
  type: string;
  children?: TreeNode[];
}

function collectHeadings(node: TreeNode, into: Heading[]): void {
  if (node.type === "heading") into.push(node as unknown as Heading);
  for (const child of node.children ?? []) collectHeadings(child, into);
}

export function rebaseHeadings(tree: Root, base: number): void {
  const headings: Heading[] = [];
  collectHeadings(tree as unknown as TreeNode, headings);
  if (headings.length === 0) return;
  const shallowest = Math.min(...headings.map((h) => h.depth));
  let previous = base - 1;
  for (const heading of headings) {
    const wanted = base + heading.depth - shallowest;
    const level = Math.min(6, Math.max(base, Math.min(wanted, previous + 1)));
    heading.depth = level as Heading["depth"];
    previous = level;
  }
}

function remarkHeadingBase(options: { base: number }) {
  return (tree: Root) => rebaseHeadings(tree, options.base);
}

export default function MarkdownRenderer({
  components,
  headingBase,
  children,
}: {
  components: MarkdownComponents;
  headingBase: number;
  children: string;
}) {
  const plugins = useMemo<NonNullable<Options["remarkPlugins"]>>(
    () => [remarkGfm, [remarkHeadingBase, { base: headingBase }]],
    [headingBase],
  );
  return (
    <ReactMarkdown components={components} remarkPlugins={plugins}>
      {children}
    </ReactMarkdown>
  );
}
