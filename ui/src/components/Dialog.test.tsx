import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "./Dialog";

function renderDialog(onClose = vi.fn()) {
  render(
    <Dialog title="End the exam?" onClose={onClose}>
      <p>This cannot be undone.</p>
      <div className="confirm-actions">
        <button onClick={onClose}>Cancel</button>
        <button>End Exam</button>
      </div>
    </Dialog>,
  );
  return onClose;
}

describe("Dialog", () => {
  test("renders as a modal dialog labelled by its title", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("End the exam?");
  });

  test("focuses the first focusable element on open", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  test("Escape closes the dialog", async () => {
    const onClose = renderDialog();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("Tab wraps focus inside the dialog", async () => {
    renderDialog();

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "End Exam" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "End Exam" })).toHaveFocus();
  });

  test("restores focus to the previously focused element on unmount", async () => {
    render(<button>opener</button>);
    const opener = screen.getByRole("button", { name: "opener" });
    opener.focus();

    const onClose = vi.fn();
    const { unmount } = render(
      <Dialog title="t" onClose={onClose}>
        <button>inside</button>
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "inside" })).toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
  });
});

describe("Dialog layering", () => {
  test("portals to the body, so no transformed ancestor can contain it", () => {
    const { container } = render(
      <div style={{ transform: "translateY(0)" }}>
        <Dialog title="Erase?" onClose={() => {}}>
          <button>Cancel</button>
        </Dialog>
      </div>,
    );
    const overlay = screen.getByRole("dialog").parentElement!;
    expect(overlay).toHaveClass("confirm-overlay");
    expect(overlay.parentElement).toBe(document.body);
    expect(container.contains(overlay)).toBe(false);
  });

  test("the page behind it is inert while it is open and live again after", async () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      <>
        <button>Behind</button>
        <Dialog title="Erase?" onClose={onClose}>
          <button>Cancel</button>
        </Dialog>
      </>,
    );
    expect(container).toHaveAttribute("inert");

    rerender(<button>Behind</button>);
    expect(container).not.toHaveAttribute("inert");
  });

  test("a parent re-render with a fresh onClose keeps focus on the button the user reached", async () => {
    const user = userEvent.setup();
    const ui = (n: number) => (
      <Dialog title={`Poll ${n}`.slice(0, 4)} onClose={() => void n}>
        <button>Cancel</button>
        <button>End Exam</button>
      </Dialog>
    );
    const { rerender } = render(ui(0));
    await user.tab();
    const end = screen.getByRole("button", { name: "End Exam" });
    expect(end).toHaveFocus();

    rerender(ui(1));
    rerender(ui(2));
    expect(end).toHaveFocus();
  });
});
