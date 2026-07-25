import { beforeEach, describe, expect, test } from "vitest";
import { applyTheme, cycleTheme, loadTheme, type ThemePreference } from "./ThemeProvider";

describe("theme preference", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  test("defaults to system when nothing is stored", () => {
    expect(loadTheme()).toBe("system");
  });

  test("applyTheme sets the attribute for explicit choices and clears it for system", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(loadTheme()).toBe("dark");

    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    applyTheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(loadTheme()).toBe("system");
  });

  test("cycleTheme walks system -> light -> dark -> system", () => {
    const order: ThemePreference[] = ["system", "light", "dark", "system"];
    for (let i = 0; i < order.length - 1; i++) {
      expect(cycleTheme(order[i])).toBe(order[i + 1]);
    }
  });

  test("garbage in storage falls back to system", () => {
    localStorage.setItem("sim.theme", "neon");
    expect(loadTheme()).toBe("system");
  });
});
