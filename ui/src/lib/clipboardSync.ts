import { desktopClipboard } from "./desktopClipboard";

const MAX_SYNC_CHARS = 100_000;

class ClipboardSync {
  private lastSynced = "";

  private lastRemote = "";

  private stopFns: Array<() => void> = [];

  start(): void {
    if (this.stopFns.length) return;
    const onCopy = () => void this.syncFromSelection();
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCopy);
    this.stopFns.push(() => {
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCopy);
    });

    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      void this.syncToHost().then((written) => {
        if (!written) void this.syncFromHost();
      });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    this.stopFns.push(() => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    });

    const unsubscribe = desktopClipboard.subscribe(() => {
      if (!document.hasFocus()) return;
      void this.syncToHost();
    });
    this.stopFns.push(unsubscribe);

    void this.syncFromHost();
  }

  stop(): void {
    for (const fn of this.stopFns) fn();
    this.stopFns = [];

    this.lastSynced = "";
    this.lastRemote = "";
  }

  syncFromSelection(): boolean {
    return this.pushToDesktop(window.getSelection()?.toString() ?? "");
  }

  async syncFromHost(): Promise<boolean> {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return false;
    }
    return this.pushToDesktop(text);
  }

  async syncToHost(): Promise<boolean> {
    const text = desktopClipboard.getRemote();
    if (!text || text === this.lastSynced || text === this.lastRemote) return false;
    if (text.length > MAX_SYNC_CHARS) return false;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return false;
    }
    this.lastRemote = text;
    this.lastSynced = text;
    return true;
  }

  private pushToDesktop(text: string): boolean {
    if (!text || text === this.lastSynced) return false;
    if (text.length > MAX_SYNC_CHARS) return false;
    if (!desktopClipboard.sendToDesktop(text)) return false;
    this.lastSynced = text;
    return true;
  }

  reset(): void {
    this.stop();
    this.lastSynced = "";
    this.lastRemote = "";
  }
}

export const clipboardSync = new ClipboardSync();
