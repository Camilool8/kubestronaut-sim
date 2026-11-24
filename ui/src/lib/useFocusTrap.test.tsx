import { describe, expect, test, vi } from "vitest";
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useFocusTrap } from "./useFocusTrap";

function Trap({
  onClose,
  modal = false,
  label = "trap",
  children,
}: {
  onClose: () => void;
  modal?: boolean;
  label?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onClose, true, { modal });
  const node = (
    <div ref={ref} role="dialog" aria-label={label}>
      {children}
    </div>
  );
  return modal ? createPortal(<div>{node}</div>, document.body) : node;
}

describe("useFocusTrap", () => {
  test("a parent re-render with a fresh onClose does not pull focus back to the first item", async () => {
    const user = userEvent.setup();
    const closes: string[] = [];
    const { rerender } = render(
      <Trap onClose={() => closes.push("first")}>
        <button>Cancel</button>
        <button>End attempt</button>
      </Trap>,
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.tab();
    const end = screen.getByRole("button", { name: "End attempt" });
    expect(end).toHaveFocus();

    for (let i = 0; i < 3; i++) {
      rerender(
        <Trap onClose={() => closes.push(`poll ${i}`)}>
          <button>Cancel</button>
          <button>End attempt</button>
        </Trap>,
      );
      expect(document.activeElement).toBe(end);
    }

    await user.keyboard("{Escape}");
    expect(closes).toEqual(["poll 2"]);
  });

  test("skips what a closed <details> hides, and counts its summary", () => {
    render(
      <Trap onClose={() => {}}>
        <details>
          <summary>Show log</summary>
          <pre tabIndex={0}>log</pre>
        </details>
        <button>Run in background</button>
      </Trap>,
    );
    expect(screen.getByText("Show log")).toHaveFocus();
  });

  test("with nothing focusable it focuses the container instead of leaving focus behind", () => {
    render(
      <Trap onClose={() => {}}>
        <details>
          <summary hidden>x</summary>
          <pre tabIndex={0}>log</pre>
        </details>
      </Trap>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();
    expect(dialog).toHaveAttribute("tabindex", "-1");
  });

  test("Tab and Escape still work when focus has escaped to the body", () => {
    const onClose = vi.fn();
    render(
      <Trap onClose={onClose}>
        <button>One</button>
        <button>Two</button>
      </Trap>,
    );
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(document.body, { key: "Tab" });
    expect(screen.getByRole("button", { name: "One" })).toHaveFocus();

    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Two" })).toHaveFocus();

    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("only the innermost open trap answers Escape", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <>
        <Trap onClose={outer} label="outer">
          <button>Outer</button>
        </Trap>
        <Trap onClose={inner} label="inner">
          <button>Inner</button>
        </Trap>
      </>,
    );
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  test("a modal trap makes the rest of the page inert, and gives it back on close", async () => {
    const user = userEvent.setup();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          {open && (
            <Trap modal onClose={() => setOpen(false)}>
              <button onClick={() => setOpen(false)}>Close</button>
            </Trap>
          )}
        </>
      );
    }
    const { container } = render(<Host />);
    const opener = screen.getByRole("button", { name: "Open" });
    await user.click(opener);

    expect(container).toHaveAttribute("inert");
    const host = screen.getByRole("dialog").parentElement!;
    expect(host.parentElement).toBe(document.body);
    expect(host).not.toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(container).not.toHaveAttribute("inert");
    expect(opener).toHaveFocus();
  });

  test("a stacked modal inerts the one beneath it until it closes", () => {
    function Stack({ second }: { second: boolean }) {
      return (
        <>
          <Trap modal label="first" onClose={() => {}}>
            <button>First</button>
          </Trap>
          {second && (
            <Trap modal label="second" onClose={() => {}}>
              <button>Second</button>
            </Trap>
          )}
        </>
      );
    }
    const { rerender, container } = render(<Stack second={false} />);
    const first = screen.getByRole("dialog", { name: "first" }).parentElement!;
    expect(container).toHaveAttribute("inert");
    expect(first).not.toHaveAttribute("inert");

    rerender(<Stack second />);
    expect(first).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Second" })).toHaveFocus();

    rerender(<Stack second={false} />);
    expect(first).not.toHaveAttribute("inert");
    expect(container).toHaveAttribute("inert");
  });

  test("leaves an element that was inert before it opened alone", () => {
    const outside = document.createElement("div");
    outside.setAttribute("inert", "");
    document.body.appendChild(outside);
    const { unmount } = render(
      <Trap modal onClose={() => {}}>
        <button>x</button>
      </Trap>,
    );
    unmount();
    expect(outside).toHaveAttribute("inert");
    outside.remove();
  });
});
