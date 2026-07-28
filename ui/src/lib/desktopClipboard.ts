// Bridge between the exam UI and the remote desktop's clipboard.
//
// Every bank question is dense with values a candidate must reproduce
// exactly — resource names, labels, image tags, /opt/course paths — and
// a typo in one of them is an invisible, self-inflicted zero. Clicking a
// value in the question panel should put it where the terminal can
// paste it.
//
// Pushing into the remote clipboard is the only architecture that works
// here: the RFB canvas captures the keyboard while focused, so a
// browser-side paste handler would never fire over the desktop. The
// viewport registers its RFB connection with this module (mirroring the
// dependency-free module-singleton shape of components/toastStore), and
// the question panel calls copyValue without needing to know whether a
// desktop is connected at all.

/** The slice of noVNC's RFB this module needs. */
export interface ClipboardTarget {
  clipboardPasteFrom(text: string): void;
}

export type CopyOutcome =
  /** Reached both the browser clipboard and the exam desktop. */
  | "desktop"
  /** Browser clipboard only — no desktop connected (lobby, score screen). */
  | "browser"
  | "failed";

export type PasteOutcome =
  /** Read the host clipboard and delivered it to the desktop. */
  | "sent"
  /** No desktop connected — nothing to paste into. */
  | "no-desktop"
  /** The browser refused to let us read the clipboard. */
  | "blocked"
  /** The host clipboard was empty. */
  | "empty";

class DesktopClipboard {
  private target: ClipboardTarget | null = null;
  private listeners = new Set<() => void>();
  /**
   * The desktop's most recent clipboard contents.
   *
   * Held rather than pushed straight at navigator.clipboard.writeText,
   * which is what used to happen: that call needs transient user
   * activation, this arrives on a WebSocket message with no gesture
   * behind it, and the failure was swallowed. So a candidate who copied
   * in the terminal usually got nothing and no indication why. Keeping
   * it lets the clipboard panel offer a real button, which is a real
   * gesture, which actually works.
   */
  private remote = "";

  /** Called by the viewport once its connection is established. */
  connect(target: ClipboardTarget): void {
    this.target = target;
  }

  /**
   * Called on disconnect/unmount. Ignores a stale target so a viewport
   * torn down after a newer one connected cannot clear the live link.
   */
  disconnect(target: ClipboardTarget): void {
    if (this.target === target) this.target = null;
  }

  get connected(): boolean {
    return this.target !== null;
  }

  /**
   * Copies text to the browser clipboard and, when a desktop is
   * connected, into its clipboard too.
   *
   * Must be called from a user gesture: both Chrome and Firefox require
   * one for navigator.clipboard.writeText. The desktop push is
   * attempted regardless of whether the browser write succeeds — the
   * two are independent, and the desktop is the one that matters here.
   */
  async copy(text: string): Promise<CopyOutcome> {
    let reachedDesktop = false;
    if (this.target) {
      try {
        this.target.clipboardPasteFrom(text);
        reachedDesktop = true;
      } catch {
        // A viewport that dropped between the click and this call; the
        // browser clipboard below is still worth having.
      }
    }

    let reachedBrowser = false;
    try {
      await navigator.clipboard.writeText(text);
      reachedBrowser = true;
    } catch {
      // Permission denied, no gesture, or no clipboard API at all.
    }

    if (reachedDesktop) return "desktop";
    return reachedBrowser ? "browser" : "failed";
  }

  /**
   * Sends arbitrary text to the desktop's clipboard, without touching
   * the browser's. Backs the clipboard panel's Send button.
   */
  sendToDesktop(text: string): boolean {
    if (!this.target) return false;
    try {
      this.target.clipboardPasteFrom(text);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reads the host clipboard and pastes it into the desktop in one go:
   * push the text into the remote clipboard, then synthesise the
   * terminal's paste chord so it actually lands. Both messages go out on
   * the same socket in order, so the server processes the cut-text
   * before the key event — which is the whole reason a single keystroke
   * can work here.
   *
   * `sendChord` is injected rather than imported so this module keeps
   * knowing nothing about the keymap (and so the test does not need one).
   */
  async pasteFromHost(sendChord: () => void): Promise<PasteOutcome> {
    if (!this.target) return "no-desktop";

    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      // Firefox has no readText for web content at all, and Chrome
      // refuses without the clipboard-read permission. This is the
      // expected path for a large share of users, not an error — the
      // caller points them at the panel.
      return "blocked";
    }
    if (!text) return "empty";

    if (!this.sendToDesktop(text)) return "no-desktop";
    // Only after the text is in the remote clipboard. Sending the chord
    // on a failed push would paste whatever was there before, which is
    // worse than doing nothing.
    sendChord();
    return "sent";
  }

  /** Called by the viewport when the desktop's clipboard changes. */
  receive(text: string): void {
    if (text === this.remote) return;
    this.remote = text;
    for (const l of this.listeners) l();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The string itself is a stable snapshot — no version counter needed. */
  getRemote = (): string => this.remote;

  /** Test-only. */
  reset(): void {
    this.target = null;
    this.remote = "";
    this.listeners.clear();
  }
}

export const desktopClipboard = new DesktopClipboard();
