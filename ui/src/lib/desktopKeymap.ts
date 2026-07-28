// Translates macOS keyboard chords into what the exam desktop expects.
//
// The problem: noVNC delivers ⌘ to the remote X server as XK_Super_L
// (core/input/keyboard.js), and nothing in this XFCE session binds Super.
// So a Mac candidate's ⌘C and ⌘V — the two chords their hands produce
// without being asked — do literally nothing, silently, in the middle of
// a timed exam. Every piece of copy in the app told them to press
// Ctrl+Shift+V instead, which works but is not what muscle memory does
// under time pressure.
//
// The fix is a small, explicit chord map applied in the browser before
// noVNC sees the event. Deliberately NOT a blanket ⌘→Ctrl remap, which
// is what Microsoft Remote Desktop does: in a terminal that turns the
// copy reflex into SIGINT, ⌘V into a literal ^V, and ⌘Z into a suspended
// process. The three most common Mac reflexes would all do damage. So
// each chord is mapped to the thing a Linux terminal actually wants.
//
// Follows the module-singleton shape of lib/desktopClipboard and
// lib/desktopResize: the viewport registers its RFB connection here, and
// nothing else needs to know whether a desktop is connected.

import { isMac } from "./platform";

/** The slice of noVNC's RFB this module needs. */
export interface KeyTarget {
  sendKey(keysym: number, code: string, down?: boolean): void;
}

// X11 keysyms, as a local table.
//
// NOT imported from @novnc/novnc/core/input/keysym.js: the package's
// "exports" field is the single string "./core/rfb.js", so every subpath
// is unresolvable and a deep import fails at build time. Do not "fix"
// this by adding the import back.
const XK = {
  Control_L: 0xffe3,
  Shift_L: 0xffe1,
  Alt_L: 0xffe9,
  Home: 0xff50,
  End: 0xff57,
  b: 0x0062,
  c: 0x0063,
  f: 0x0066,
  l: 0x006c,
  t: 0x0074,
  u: 0x0075,
  v: 0x0076,
  w: 0x0077,
} as const;

/** One key press, with the modifiers to hold around it. */
interface Chord {
  keysym: number;
  /** DOM code — rfb.js routes it through XtScancode, so it must be real. */
  code: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** What this does on the desktop, for the shortcut help. */
  describes: string;
}

/**
 * ⌘/⌥ chords translated by default.
 *
 * Keyed by `event.key` lowercased, prefixed by the modifier. Everything
 * absent from this table passes straight through untouched — the map is
 * an allowlist, not an interception layer.
 */
const MAC_CHORDS: Record<string, Chord> = {
  // The two that matter. xfce4-terminal's copy/paste are Ctrl+Shift+C/V,
  // and MiscShowUnsafePasteDialog is already off in the image, so a
  // multi-line paste lands without a confirmation dialog.
  "meta+c": { keysym: XK.c, code: "KeyC", ctrl: true, shift: true, describes: "Copy" },
  "meta+v": { keysym: XK.v, code: "KeyV", ctrl: true, shift: true, describes: "Paste" },
  // macOS Terminal clears with ⌘K; the Linux equivalent is Ctrl+L.
  "meta+k": { keysym: XK.l, code: "KeyL", ctrl: true, describes: "Clear the screen" },
  // Line movement. On macOS these are ⌘←/→; readline wants Home/End.
  "meta+arrowleft": { keysym: XK.Home, code: "Home", describes: "Start of line" },
  "meta+arrowright": { keysym: XK.End, code: "End", describes: "End of line" },
  // Word movement. macOS uses ⌥←/→; readline binds Alt+B / Alt+F.
  "alt+arrowleft": { keysym: XK.b, code: "KeyB", alt: true, describes: "Back one word" },
  "alt+arrowright": { keysym: XK.f, code: "KeyF", alt: true, describes: "Forward one word" },
  // ⌘⌫ deletes to the start of the line on macOS; readline is Ctrl+U.
  "meta+backspace": { keysym: XK.u, code: "KeyU", ctrl: true, describes: "Delete to start of line" },
};

/**
 * Chords the browser refuses to give up.
 *
 * Chrome and Firefox reserve new-tab and close-tab, and preventDefault
 * does not stop them outside an installed/standalone window. Shipping
 * them as defaults would mean two mappings that visibly do nothing,
 * which costs more trust than the shortcuts are worth — so they are
 * offered explicitly, with that caveat, rather than enabled quietly.
 */
export const BROWSER_RESERVED: Record<string, Chord> = {
  "meta+t": { keysym: XK.t, code: "KeyT", ctrl: true, shift: true, describes: "New terminal tab" },
  "meta+w": { keysym: XK.w, code: "KeyW", ctrl: true, shift: true, describes: "Close terminal tab" },
};

const STORAGE_KEY = "sim.desktopKeymap.enabled";
const STORAGE_KEY_RESERVED = "sim.desktopKeymap.reserved";

/** A row for the shortcut-help table. */
export interface ChordRow {
  /** What the candidate presses, e.g. "⌘C". */
  press: string;
  /** What the desktop receives, e.g. "Ctrl+Shift+C". */
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

  /** Called by the viewport once its connection is established. */
  attach(target: KeyTarget): void {
    this.target = target;
    this.emit();
  }

  /**
   * Ignores a stale target so a viewport torn down after a newer one
   * connected cannot clear the live link (same guard as desktopClipboard).
   */
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

  /** Whether the remapping is switched on (regardless of platform). */
  get enabled(): boolean {
    return this.enabledPref;
  }

  /** Whether the browser-reserved chords are opted into. */
  get reservedEnabled(): boolean {
    return this.reservedPref;
  }

  /** Whether chords are actually being translated right now. */
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

  /** The whole map, for the shortcut-help table. */
  rows(): ChordRow[] {
    const all = { ...MAC_CHORDS, ...(this.reservedPref ? BROWSER_RESERVED : {}) };
    return Object.entries(all).map(([key, c]) => ({
      press: pressLabel(key),
      sends: sendsLabel(c),
      describes: c.describes,
    }));
  }

  /**
   * Handles a keydown over the desktop canvas. Returns true when the
   * event was consumed and the caller must preventDefault + stopPropagation.
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.active) return false;

    // Swallow the bare Meta press. Without this, ⌘ on its own has already
    // reached noVNC and asserted Super_L on the remote X server by the
    // time the letter arrives — leaving a modifier stuck down that
    // nothing here ever releases. Super binds to nothing in this XFCE
    // session, so suppressing it costs the candidate nothing.
    if (event.key === "Meta") return true;

    const chord = this.lookup(event);
    if (!chord) return false;
    this.send(chord);
    return true;
  }

  /** Symmetric with handleKeyDown: a consumed chord must not leak its keyup. */
  handleKeyUp(event: KeyboardEvent): boolean {
    if (!this.active) return false;
    if (event.key === "Meta") return true;
    return this.lookup(event) !== null;
  }

  private lookup(event: KeyboardEvent): Chord | null {
    const key = event.key?.toLowerCase();
    if (!key) return null;
    // metaKey wins when both are held: ⌘ is the one being translated.
    const prefix = event.metaKey ? "meta" : event.altKey ? "alt" : null;
    if (!prefix) return null;
    const table = { ...MAC_CHORDS, ...(this.reservedPref ? BROWSER_RESERVED : {}) };
    return table[`${prefix}+${key}`] ?? null;
  }

  /**
   * Presses the modifiers, taps the key, releases the modifiers — in
   * that order, on one socket, so the server sees a well-formed chord
   * and is never left holding a modifier.
   */
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
    } catch {
      // A viewport that dropped between the keypress and here. Nothing
      // useful to say: the reconnect overlay is already up.
    }
  }

  /** Sends an arbitrary chord — used by the clipboard paste path. */
  sendPasteChord(): void {
    this.send({ keysym: XK.v, code: "KeyV", ctrl: true, shift: true, describes: "Paste" });
  }

  /** Test-only, mirroring desktopResize.reset. */
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
    return fallback; // private mode, or storage disabled
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Preference is a nicety; failing to persist it must not break input.
  }
}

export const desktopKeymap = new DesktopKeymap();

/**
 * What to tell the candidate to press to paste into the exam terminal.
 *
 * The desktop's terminal only ever accepts Ctrl+Shift+V; this is about
 * which keys the candidate's hands should make. With translation on, a
 * Mac user presses ⌘V and this module turns it into that chord — so
 * telling them "Ctrl+Shift+V" would be technically true and practically
 * the wrong instruction.
 */
export function pasteChordLabel(): string {
  return desktopKeymap.isMac && desktopKeymap.enabled ? "⌘V" : "Ctrl+Shift+V";
}
