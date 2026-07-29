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
   */
  private lastSynced = "";
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
  }

  stop(): void {
    for (const fn of this.stopFns) fn();
    this.stopFns = [];
  }

  /**
   * Pushes the current DOM selection to the desktop.
   *
   * Returns whether anything was sent, which is what the tests assert on.
   */
  syncFromSelection(): boolean {
    return this.pushToDesktop(window.getSelection()?.toString() ?? "");
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
  }
}

export const clipboardSync = new ClipboardSync();
