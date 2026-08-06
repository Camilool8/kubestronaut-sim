export interface ClipboardTarget {
  clipboardPasteFrom(text: string): void;
}

const TRANSLITERATIONS: Record<string, string> = {
  "\u2014": "-",
  "\u2013": "-",
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2026": "...",
  "\u00a0": " ",
};

export function toAsciiForDesktop(text: string): string {
  let out = "";
  for (const ch of text) {
    const mapped = TRANSLITERATIONS[ch];
    if (mapped !== undefined) {
      out += mapped;
    } else if (ch.codePointAt(0)! < 0x80) {
      out += ch;
    } else {
      out += "?";
    }
  }
  return out;
}

export type CopyOutcome =

  | "desktop"

  | "browser"
  | "failed";

export type PasteOutcome =

  | "sent"

  | "no-desktop"

  | "blocked"

  | "empty";

class DesktopClipboard {
  private target: ClipboardTarget | null = null;
  private listeners = new Set<() => void>();

  private remote = "";

  connect(target: ClipboardTarget): void {
    this.target = target;
  }

  private pushToTarget(text: string): boolean {
    if (!this.target) return false;
    try {
      this.target.clipboardPasteFrom(toAsciiForDesktop(text));
      return true;
    } catch {
      return false;
    }
  }

  disconnect(target: ClipboardTarget): void {
    if (this.target === target) this.target = null;
  }

  get connected(): boolean {
    return this.target !== null;
  }

  async copy(text: string): Promise<CopyOutcome> {
    const reachedDesktop = this.pushToTarget(text);

    let reachedBrowser = false;
    try {
      await navigator.clipboard.writeText(text);
      reachedBrowser = true;
    } catch {}

    if (reachedDesktop) return "desktop";
    return reachedBrowser ? "browser" : "failed";
  }

  sendToDesktop(text: string): boolean {
    return this.pushToTarget(text);
  }

  async pasteFromHost(sendChord: () => void): Promise<PasteOutcome> {
    if (!this.target) return "no-desktop";

    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return "blocked";
    }
    if (!text) return "empty";

    if (!this.sendToDesktop(text)) return "no-desktop";

    sendChord();
    return "sent";
  }

  receive(text: string): void {
    if (text === this.remote) return;
    this.remote = text;
    for (const l of this.listeners) l();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getRemote = (): string => this.remote;

  reset(): void {
    this.target = null;
    this.remote = "";
    this.listeners.clear();
  }
}

export const desktopClipboard = new DesktopClipboard();
