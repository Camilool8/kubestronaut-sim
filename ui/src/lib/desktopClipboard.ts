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

class DesktopClipboard {
  private target: ClipboardTarget | null = null;

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
}

export const desktopClipboard = new DesktopClipboard();
