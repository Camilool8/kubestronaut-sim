import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeaderMenu } from "./HeaderMenu";

describe("HeaderMenu", () => {
  test("starts closed and says so", () => {
    render(
      <HeaderMenu label="Menu">
        <button type="button">Exams</button>
      </HeaderMenu>,
    );
    const trigger = screen.getByRole("button", { name: "Menu" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Exams" })).toBeNull();
  });

  test("opens, and the trigger points at what it opened", async () => {
    const user = userEvent.setup();
    render(
      <HeaderMenu label="Menu">
        <button type="button">Exams</button>
      </HeaderMenu>,
    );
    const trigger = screen.getByRole("button", { name: "Menu" });
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("group");
    expect(trigger).toHaveAttribute("aria-controls", panel.id);
    expect(screen.getByRole("button", { name: "Exams" })).toBeInTheDocument();
  });

  test("Escape closes it and hands focus back", async () => {
    const user = userEvent.setup();
    render(
      <HeaderMenu label="Menu">
        <button type="button">Exams</button>
      </HeaderMenu>,
    );
    const trigger = screen.getByRole("button", { name: "Menu" });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("button", { name: "Exams" })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  // A menu left open behind the screen its own link just changed is the
  // classic mobile-nav bug.
  test("choosing something closes it", async () => {
    const user = userEvent.setup();
    render(
      <HeaderMenu label="Menu">
        <button type="button">Exams</button>
      </HeaderMenu>,
    );
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("button", { name: "Exams" }));
    expect(screen.queryByRole("button", { name: "Exams" })).toBeNull();
  });
});
