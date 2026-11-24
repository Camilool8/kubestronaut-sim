const EXEMPT_ATTR = "data-modal-exempt";

const stack: HTMLElement[] = [];
const marked = new Set<Element>();

function topLevel(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node && node.parentElement !== document.body) node = node.parentElement;
  return node;
}

function sync(): void {
  const top = stack[stack.length - 1];
  const want = new Set<Element>();
  if (top) {
    for (const child of Array.from(document.body.children)) {
      if (child === top || child.hasAttribute(EXEMPT_ATTR)) continue;
      if (child.tagName === "SCRIPT" || child.tagName === "STYLE") continue;
      want.add(child);
    }
  }
  for (const el of Array.from(marked)) {
    if (want.has(el)) continue;
    el.removeAttribute("inert");
    marked.delete(el);
  }
  for (const el of want) {
    if (marked.has(el) || el.hasAttribute("inert")) continue;
    el.setAttribute("inert", "");
    marked.add(el);
  }
}

export function holdModal(container: HTMLElement): () => void {
  const host = topLevel(container);
  if (!host) return () => {};
  stack.push(host);
  sync();
  return () => {
    const at = stack.lastIndexOf(host);
    if (at !== -1) stack.splice(at, 1);
    sync();
  };
}

export const modalExemptProps = { [EXEMPT_ATTR]: "" } as const;
