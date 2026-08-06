import { isMac } from "./platform";
import { strings } from "../strings";

export interface KeyTarget {
  sendKey(keysym: number, code: string, down?: boolean): void;
}

const XK = {
  Control_L: 0xffe3,
  Shift_L: 0xffe1,
  Alt_L: 0xffe9,
  Home: 0xff50,
  End: 0xff57,
  b: 0x0062,
  f: 0x0066,
  l: 0x006c,
  u: 0x0075,

  C: 0x0043,
  T: 0x0054,
  V: 0x0056,
  W: 0x0057,
} as const;

interface Chord {
  keysym: number;

  code: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;

  describes: string;
}

const MAC_CHORDS: Record<string, Chord> = {
  "meta+c": { keysym: XK.C, code: "KeyC", ctrl: true, shift: true, describes: strings.keymap.copy },
  "meta+v": { keysym: XK.V, code: "KeyV", ctrl: true, shift: true, describes: strings.keymap.paste },

  "meta+k": { keysym: XK.l, code: "KeyL", ctrl: true, describes: strings.keymap.clearScreen },

  "meta+arrowleft": { keysym: XK.Home, code: "Home", describes: strings.keymap.startOfLine },
  "meta+arrowright": { keysym: XK.End, code: "End", describes: strings.keymap.endOfLine },

  "alt+arrowleft": { keysym: XK.b, code: "KeyB", alt: true, describes: strings.keymap.backWord },
  "alt+arrowright": { keysym: XK.f, code: "KeyF", alt: true, describes: strings.keymap.forwardWord },

  "meta+backspace": { keysym: XK.u, code: "KeyU", ctrl: true, describes: strings.keymap.deleteToStartOfLine },
};

export const BROWSER_RESERVED: Record<string, Chord> = {
  "meta+t": { keysym: XK.T, code: "KeyT", ctrl: true, shift: true, describes: strings.keymap.newTerminalTab },
  "meta+w": { keysym: XK.W, code: "KeyW", ctrl: true, shift: true, describes: strings.keymap.closeTerminalTab },
};

const STORAGE_KEY = "sim.desktopKeymap.enabled";
const STORAGE_KEY_RESERVED = "sim.desktopKeymap.reserved";

export interface ChordRow {
  press: string;

  sends: string;
  describes: string;
}

function pressLabel(key: string): string {
  const [mod, rest] = key.split("+");
  const glyph = mod === "meta" ? "⌘" : "⌥";
  const named: Record<string, string> = {
    arrowleft: "←",
    arrowright: "→",
    backspace: "⌫",
  };
  return glyph + (named[rest] ?? rest.toUpperCase());
}

function sendsLabel(c: Chord): string {
  const parts: string[] = [];
  if (c.ctrl) parts.push("Ctrl");
  if (c.alt) parts.push("Alt");
  if (c.shift) parts.push("Shift");
  const named: Record<string, string> = { Home: "Home", End: "End" };
  parts.push(named[c.code] ?? c.code.replace(/^Key/, ""));
  return parts.join("+");
}

class DesktopKeymap {
  private target: KeyTarget | null = null;
  private listeners = new Set<() => void>();
  private version = 0;
  private enabledPref: boolean;
  private reservedPref: boolean;

  constructor() {
    this.enabledPref = readFlag(STORAGE_KEY, true);
    this.reservedPref = readFlag(STORAGE_KEY_RESERVED, false);
  }

  attach(target: KeyTarget): void {
    this.target = target;
    this.emit();
  }

  detach(target: KeyTarget): void {
    if (this.target === target) {
      this.target = null;
      this.emit();
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  get isMac(): boolean {
    return isMac();
  }

  get enabled(): boolean {
    return this.enabledPref;
  }

  get reservedEnabled(): boolean {
    return this.reservedPref;
  }

  get active(): boolean {
    return this.isMac && this.enabledPref && this.target !== null;
  }

  setEnabled(next: boolean): void {
    this.enabledPref = next;
    writeFlag(STORAGE_KEY, next);
    this.emit();
  }

  setReservedEnabled(next: boolean): void {
    this.reservedPref = next;
    writeFlag(STORAGE_KEY_RESERVED, next);
    this.emit();
  }

  rows(): ChordRow[] {
    const all = { ...MAC_CHORDS, ...(this.reservedPref ? BROWSER_RESERVED : {}) };
    return Object.entries(all).map(([key, c]) => ({
      press: pressLabel(key),
      sends: sendsLabel(c),
      describes: c.describes,
    }));
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.active) return false;

    if (event.key === "Meta") return true;

    const chord = this.lookup(event);
    if (!chord) return false;
    this.send(chord);
    return true;
  }

  handleKeyUp(event: KeyboardEvent): boolean {
    if (!this.active) return false;
    if (event.key === "Meta") return true;
    return this.lookup(event) !== null;
  }

  private lookup(event: KeyboardEvent): Chord | null {
    const key = event.key?.toLowerCase();
    if (!key) return null;

    const prefix = event.metaKey ? "meta" : event.altKey ? "alt" : null;
    if (!prefix) return null;
    const table = { ...MAC_CHORDS, ...(this.reservedPref ? BROWSER_RESERVED : {}) };
    return table[`${prefix}+${key}`] ?? null;
  }

  private send(chord: Chord): void {
    const t = this.target;
    if (!t) return;
    const mods: Array<[number, string]> = [];
    if (chord.ctrl) mods.push([XK.Control_L, "ControlLeft"]);
    if (chord.alt) mods.push([XK.Alt_L, "AltLeft"]);
    if (chord.shift) mods.push([XK.Shift_L, "ShiftLeft"]);

    try {
      for (const [ks, code] of mods) t.sendKey(ks, code, true);
      t.sendKey(chord.keysym, chord.code, true);
      t.sendKey(chord.keysym, chord.code, false);
      for (const [ks, code] of mods.reverse()) t.sendKey(ks, code, false);
    } catch {}
  }

  sendPasteChord(): void {
    this.send({ keysym: XK.V, code: "KeyV", ctrl: true, shift: true, describes: "Paste" });
  }

  reset(): void {
    this.target = null;
    this.enabledPref = true;
    this.reservedPref = false;
    this.version = 0;
    this.listeners.clear();
  }

  private emit(): void {
    this.version += 1;
    for (const l of this.listeners) l();
  }
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === "true";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {}
}

export const desktopKeymap = new DesktopKeymap();

export function pasteChordLabel(): string {
  return "Ctrl+V";
}

export function isPasteChord(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): boolean {
  return (
    event.key?.toLowerCase() === "v" &&
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey
  );
}
