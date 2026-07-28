import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { desktopKeymap, pasteChordLabel, type KeyTarget } from "./desktopKeymap";

// Every sendKey call, in order, as [keysym, code, down].
type Sent = [number, string, boolean | undefined];

function fakeTarget(): { target: KeyTarget; sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    target: {
      sendKey(keysym: number, code: string, down?: boolean) {
        sent.push([keysym, code, down]);
      },
    },
  };
}

function keydown(key: string, mods: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, ...mods });
}

function setMac(is: boolean) {
  Object.defineProperty(window.navigator, "platform", {
    value: is ? "MacIntel" : "Win32",
    configurable: true,
  });
}

beforeEach(() => {
  desktopKeymap.reset();
  setMac(true);
});

afterEach(() => {
  desktopKeymap.reset();
  vi.unstubAllGlobals();
});

describe("desktopKeymap", () => {
  test("does nothing until a desktop is attached", () => {
    expect(desktopKeymap.active).toBe(false);
    expect(desktopKeymap.handleKeyDown(keydown("c", { metaKey: true }))).toBe(false);
  });

  test("is inert on a non-Mac, so PC users keep their own key handling", () => {
    setMac(false);
    const { target } = fakeTarget();
    desktopKeymap.attach(target);
    expect(desktopKeymap.active).toBe(false);
    expect(desktopKeymap.handleKeyDown(keydown("c", { metaKey: true }))).toBe(false);
  });

  // The whole point: ⌘C must arrive as the terminal's copy chord, NOT as
  // Ctrl+C, which would send SIGINT and kill whatever is running.
  test("Cmd+C becomes Ctrl+Shift+C, with modifiers held around the key", () => {
    const { target, sent } = fakeTarget();
    desktopKeymap.attach(target);

    expect(desktopKeymap.handleKeyDown(keydown("c", { metaKey: true }))).toBe(true);

    expect(sent).toEqual([
      [0xffe3, "ControlLeft", true],
      [0xffe1, "ShiftLeft", true],
      [0x0063, "KeyC", true],
      [0x0063, "KeyC", false],
      [0xffe1, "ShiftLeft", false],
      [0xffe3, "ControlLeft", false],
    ]);
  });

  test("Cmd+K becomes Ctrl+L, the Linux clear", () => {
    const { target, sent } = fakeTarget();
    desktopKeymap.attach(target);
    desktopKeymap.handleKeyDown(keydown("k", { metaKey: true }));
    expect(sent.map((s) => s[1])).toEqual(["ControlLeft", "KeyL", "KeyL", "ControlLeft"]);
  });

  test("Cmd+arrows become Home/End with no modifiers", () => {
    const { target, sent } = fakeTarget();
    desktopKeymap.attach(target);
    desktopKeymap.handleKeyDown(keydown("ArrowLeft", { metaKey: true }));
    expect(sent).toEqual([
      [0xff50, "Home", true],
      [0xff50, "Home", false],
    ]);
  });

  test("Option+arrows become Alt+B / Alt+F for word movement", () => {
    const { target, sent } = fakeTarget();
    desktopKeymap.attach(target);
    desktopKeymap.handleKeyDown(keydown("ArrowRight", { altKey: true }));
    expect(sent.map((s) => s[1])).toEqual(["AltLeft", "KeyF", "KeyF", "AltLeft"]);
  });

  // Without this, ⌘ alone reaches noVNC first and leaves Super_L held
  // down on the remote X server with nothing to release it.
  test("a bare Meta press is swallowed and sends nothing", () => {
    const { target, sent } = fakeTarget();
    desktopKeymap.attach(target);
    expect(desktopKeymap.handleKeyDown(keydown("Meta", { metaKey: true }))).toBe(true);
    expect(sent).toEqual([]);
  });

  test("a consumed chord also consumes its keyup, so nothing leaks", () => {
    const { target } = fakeTarget();
    desktopKeymap.attach(target);
    const up = new KeyboardEvent("keyup", { key: "c", metaKey: true });
    expect(desktopKeymap.handleKeyUp(up)).toBe(true);
  });

  // The map is an allowlist. Anything outside it must reach the desktop
  // untouched — a candidate's own Ctrl-chords, plain typing, everything.
  test("unmapped chords and plain keys pass through", () => {
    const { target, sent } = fakeTarget();
    desktopKeymap.attach(target);
    expect(desktopKeymap.handleKeyDown(keydown("a"))).toBe(false);
    expect(desktopKeymap.handleKeyDown(keydown("c", { ctrlKey: true }))).toBe(false);
    expect(desktopKeymap.handleKeyDown(keydown("q", { metaKey: true }))).toBe(false);
    expect(sent).toEqual([]);
  });

  // Chrome and Firefox act on these before the page can, so shipping
  // them on by default would mean two mappings that visibly do nothing.
  test("Cmd+T and Cmd+W are off by default and opt-in", () => {
    const { target } = fakeTarget();
    desktopKeymap.attach(target);
    expect(desktopKeymap.handleKeyDown(keydown("t", { metaKey: true }))).toBe(false);

    desktopKeymap.setReservedEnabled(true);
    expect(desktopKeymap.handleKeyDown(keydown("t", { metaKey: true }))).toBe(true);
  });

  test("the toggle switches translation off entirely", () => {
    const { target, sent } = fakeTarget();
    desktopKeymap.attach(target);
    desktopKeymap.setEnabled(false);
    expect(desktopKeymap.active).toBe(false);
    expect(desktopKeymap.handleKeyDown(keydown("c", { metaKey: true }))).toBe(false);
    expect(sent).toEqual([]);
  });

  test("a stale detach cannot clear a newer connection", () => {
    const first = fakeTarget();
    const second = fakeTarget();
    desktopKeymap.attach(first.target);
    desktopKeymap.attach(second.target);
    desktopKeymap.detach(first.target);
    expect(desktopKeymap.active).toBe(true);
  });

  test("rows() describes every active chord for the help table", () => {
    const rows = desktopKeymap.rows();
    const copy = rows.find((r) => r.press === "⌘C");
    expect(copy).toEqual({ press: "⌘C", sends: "Ctrl+Shift+C", describes: "Copy" });
    expect(rows.find((r) => r.press === "⌘←")?.sends).toBe("Home");
  });
});

describe("pasteChordLabel", () => {
  test("names the key the candidate should actually press", () => {
    setMac(true);
    desktopKeymap.setEnabled(true);
    expect(pasteChordLabel()).toBe("⌘V");

    // With translation off, ⌘V is not intercepted, so telling them to
    // press it would be wrong.
    desktopKeymap.setEnabled(false);
    expect(pasteChordLabel()).toBe("Ctrl+Shift+V");

    setMac(false);
    desktopKeymap.setEnabled(true);
    expect(pasteChordLabel()).toBe("Ctrl+Shift+V");
  });
});
