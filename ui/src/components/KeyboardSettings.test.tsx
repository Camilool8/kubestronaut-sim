import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KeyboardSettings } from "./KeyboardSettings";
import { ShortcutHelp } from "./ShortcutHelp";
import { singleKeyShortcuts } from "../lib/singleKeyShortcuts";
import { strings } from "../strings";

function setPlatform(value: string) {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(value);
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  singleKeyShortcuts.reset();
});

describe("KeyboardSettings", () => {
  test("off a Mac it offers only the single-key switch", () => {
    setPlatform("Win32");
    render(<KeyboardSettings onClose={() => {}} />);

    expect(screen.getByRole("checkbox", { name: strings.focus.singleKeysToggle })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: strings.keyboard.macToggle })).toBeNull();
    expect(screen.queryByRole("button", { name: strings.keyboard.helpOpen })).toBeNull();
  });

  test("on a Mac the translation switches sit beside it", () => {
    setPlatform("MacIntel");
    render(<KeyboardSettings onClose={() => {}} onShowHelp={() => {}} />);

    expect(screen.getByRole("checkbox", { name: strings.focus.singleKeysToggle })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: strings.keyboard.macToggle })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: strings.keyboard.helpOpen })).toBeInTheDocument();
  });

  test("the switch persists across a reload", async () => {
    const user = userEvent.setup();
    render(<KeyboardSettings onClose={() => {}} />);

    await user.click(screen.getByRole("checkbox", { name: strings.focus.singleKeysToggle }));
    expect(window.localStorage.getItem("sim.singleKeyShortcuts")).toBe("false");

    singleKeyShortcuts.reset();
    expect(singleKeyShortcuts.enabled).toBe(false);
    expect(screen.getByRole("checkbox", { name: strings.focus.singleKeysToggle })).not.toBeChecked();
  });

  test("defaults to on, and an unreadable store does not turn it off", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    singleKeyShortcuts.reset();
    expect(singleKeyShortcuts.enabled).toBe(true);
  });
});

describe("ShortcutHelp with single-key shortcuts off", () => {
  test("says so, and how to get them back", () => {
    singleKeyShortcuts.setEnabled(false);
    render(<ShortcutHelp onClose={() => {}} />);
    expect(screen.getByText(strings.focus.singleKeysOff)).toBeInTheDocument();
  });

  test("says nothing extra while they are on", () => {
    render(<ShortcutHelp onClose={() => {}} />);
    expect(screen.queryByText(strings.focus.singleKeysOff)).toBeNull();
  });
});
