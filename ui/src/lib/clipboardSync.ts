// Keeps the host clipboard and the exam desktop's clipboard in step.
//
// Before this existed, the desktop's clipboard was written only by an
// explicit click on a copy control in the question panel. A candidate who
// highlighted prose and pressed ⌘C — or copied a manifest out of an
// editor — had no way to get it across: the value reached the host
// clipboard and stopped there.
//
// Two triggers, deliberately different in what they cost. A copy raised
// inside the page carries a live DOM selection, so it needs no clipboard
// permission in any browser. Reading what another application put on the
// host clipboard needs navigator.clipboard.readText, which Firefox does
// not expose to web content at all — that half degrades to the Clipboard
// panel rather than failing loudly.
//
// Module-singleton shape, following desktopClipboard and desktopKeymap:
// the Exam screen starts it, and nothing else needs to know it exists.

import { desktopClipboard } from "./desktopClipboard";

/**
 * Longest value worth mirroring.
 *
 * Xvnc is started with -MaxCutText 2097152, so this is far below what the
 * transport accepts. The limit exists to stop a candidate who selected an
 * entire scrollback from pushing megabytes across the socket on every
 * keystroke of a chord.
 */
const MAX_SYNC_CHARS = 100_000;

class ClipboardSync {
  /**
   * The last value moved in either direction.
   *
   * The whole reason both directions can be automatic. Without it the two
   * ping-pong: the page writes X to the host, the next focus reads X back,
   * and pushes it to the desktop again. A value that arrived from one side
   * is never sent back to it.
   *
   * This is a watermark, not a level: pushToDesktop moves it on every
   * host → desktop send, so after a page copy it no longer describes what
   * the desktop's clipboard currently holds. desktopClipboard.getRemote()
   * is the level — the last value the desktop actually sent, moved only
   * by receive(). syncToHost must not treat "differs from lastSynced" as
   * "the desktop has something new": a page copy moves the watermark away
   * from a remote value that never changed, which would make that stale
   * value look new again on every later focus and overwrite whatever the
   * user just put on the real host clipboard. lastRemote below is what
   * keeps that comparison edge-triggered on the level instead.
   */
  private lastSynced = "";

  /**
   * The last desktop value actually written to the host clipboard.
   *
   * Set only after a successful write, so a refused write still retries on
   * the next focus. Exists purely to edge-trigger syncToHost against
   * desktopClipboard's level (see lastSynced above) instead of comparing
   * against the shared watermark.
   */
  private lastRemote = "";

  private stopFns: Array<() => void> = [];

  start(): void {
    if (this.stopFns.length) return; // idempotent: effects can run twice
    const onCopy = () => void this.syncFromSelection();
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCopy);
    this.stopFns.push(() => {
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCopy);
    });

    // Returning to the tab is the moment a candidate has just copied
    // something elsewhere. visibilitychange covers tab switches;
    // focus covers switching between windows of the same tab.
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

    // The desktop pushes its clipboard on every explicit copy there.
    // Writing needs a focused document, so a change that arrives while the
    // candidate is looking elsewhere is picked up by the focus handler.
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
    // A fresh desktop container (a new exam attempt) starts with an empty
    // clipboard. Leaving these set would make start()'s mount-time read see
    // an unchanged host value and push nothing, so the new desktop would
    // stay empty until the candidate copied again.
    this.lastSynced = "";
    this.lastRemote = "";
  }

  /**
   * Pushes the current DOM selection to the desktop.
   *
   * Returns whether anything was sent, which is what the tests assert on.
   */
  syncFromSelection(): boolean {
    return this.pushToDesktop(window.getSelection()?.toString() ?? "");
  }

  /**
   * Reads the host clipboard and pushes it to the desktop.
   *
   * Silent on refusal by design: Firefox has no readText for web content,
   * and Chrome needs a granted permission. This runs on every tab focus,
   * so a warning here would fire constantly for a large share of users.
   * The Clipboard panel is the path that always works, and its copy
   * already says so.
   */
  async syncFromHost(): Promise<boolean> {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return false;
    }
    return this.pushToDesktop(text);
  }

  /**
   * Writes the desktop's clipboard to the host.
   *
   * Chrome grants clipboard-write to the focused tab, so no gesture is
   * needed. Firefox refuses without one — the Clipboard panel's button is
   * a real gesture and stays for exactly that case.
   */
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

  /** Sends to the desktop unless it is empty, oversized, or already there. */
  private pushToDesktop(text: string): boolean {
    if (!text || text === this.lastSynced) return false;
    if (text.length > MAX_SYNC_CHARS) return false;
    if (!desktopClipboard.sendToDesktop(text)) return false;
    this.lastSynced = text;
    return true;
  }

  /** Test-only, mirroring desktopKeymap.reset. */
  reset(): void {
    this.stop();
    this.lastSynced = "";
    this.lastRemote = "";
  }
}

export const clipboardSync = new ClipboardSync();
