import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { desktopKeymap, isPasteChord, pasteChordLabel, type KeyTarget } from "./desktopKeymap";

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

    // Shifted keysym, not the lowercase one: Shift plus a lowercase keysym
    // is the same inconsistent pair that broke paste (see "a shifted
    // chord sends the uppercase keysym" below).
    expect(sent).toEqual([
      [0xffe3, "ControlLeft", true],
      [0xffe1, "ShiftLeft", true],
      [0x0043, "KeyC", true],
      [0x0043, "KeyC", false],
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

  test("a shifted chord sends the uppercase keysym", () => {
    // X11 derives the character from keycode + modifier state. Naming the
    // lowercase keysym while holding Shift is inconsistent, and GTK's
    // Ctrl+Shift+V accelerator does not match it — the terminal then
    // forwards a bare Ctrl+V, which is readline's verbatim-insert prefix.
    const { target, sent } = fakeTarget();
    desktopKeymap.attach(target);

    desktopKeymap.sendPasteChord();

    expect(sent).toContainEqual([0x0056, "KeyV", true]);
    expect(sent).not.toContainEqual([0x0076, "KeyV", true]);
  });

  test("every shifted chord in the map uses an uppercase keysym", () => {
    const { target, sent } = fakeTarget();
    desktopKeymap.setReservedEnabled(true);
    desktopKeymap.attach(target);

    // ⌘C -> Ctrl+Shift+C, ⌘T -> Ctrl+Shift+T, ⌘W -> Ctrl+Shift+W.
    for (const key of ["c", "t", "w"]) {
      desktopKeymap.handleKeyDown(keydown(key, { metaKey: true }));
    }

    // Down-only: send() taps each key down then up, so every keysym
    // appears twice.
    const letters = sent.filter(([ks, , down]) => down && ks >= 0x0041 && ks <= 0x007a);
    expect(letters.map(([ks]) => ks)).toEqual([0x0043, 0x0054, 0x0057]);
  });
});

describe("pasteChordLabel", () => {
  // One instruction for everyone. The viewport intercepts Ctrl+V and ⌘V
  // identically regardless of platform or of whether Mac translation is
  // on, so the label must not vary with either — it used to, which meant
  // the same screen told two candidates two different things.
  test("is the same on every platform and either preference", () => {
    for (const mac of [true, false]) {
      for (const enabled of [true, false]) {
        setMac(mac);
        desktopKeymap.setEnabled(enabled);
        expect(pasteChordLabel(), `mac=${mac} enabled=${enabled}`).toBe("Ctrl+V");
      }
    }
  });
});

// The regression this exists for: a Ctrl+V that reaches the remote
// terminal is readline's verbatim-insert prefix and prints `^V` instead
// of pasting. The viewport must therefore recognise — and swallow —
// every one of these, whatever the platform or the preferences.
describe("isPasteChord", () => {
  const ev = (o: Partial<KeyboardEvent>) =>
    ({ key: "v", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o }) as KeyboardEvent;

  test("both Ctrl+V and Cmd+V count, on every platform and preference", () => {
    for (const mac of [true, false]) {
      for (const enabled of [true, false]) {
        setMac(mac);
        desktopKeymap.setEnabled(enabled);
        expect(isPasteChord(ev({ ctrlKey: true })), `ctrl mac=${mac} on=${enabled}`).toBe(true);
        expect(isPasteChord(ev({ metaKey: true })), `meta mac=${mac} on=${enabled}`).toBe(true);
      }
    }
  });

  test("uppercase V counts — caps lock must not turn paste back into ^V", () => {
    expect(isPasteChord(ev({ key: "V", ctrlKey: true }))).toBe(true);
  });

  test("the terminal's own Ctrl+Shift+V passes straight through", () => {
    expect(isPasteChord(ev({ ctrlKey: true, shiftKey: true }))).toBe(false);
  });

  test("plain v, and other chords on v, are not paste", () => {
    expect(isPasteChord(ev({}))).toBe(false);
    expect(isPasteChord(ev({ altKey: true }))).toBe(false);
    expect(isPasteChord(ev({ key: "c", ctrlKey: true }))).toBe(false);
  });
});
