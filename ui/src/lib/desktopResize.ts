// One server-side framebuffer resize per gesture, not one per frame.
//
// noVNC throttles SetDesktopSize to 10/s with a single request in flight
// (core/rfb.js:799-810), so dragging the panel edge will not flood the
// wire. That is not the problem. Every *accepted* request is a real X
// RandR mode change — framebuffer reallocation, a full-screen update, and
// a ConfigureNotify that the window manager and the candidate's open
// terminal both act on — and rfb.js:2967-2971 deliberately re-arms on
// each ack to check whether the size moved again while it waited. A
// two-second drag is twenty of those: the desktop strobes and the
// terminal reflows its column count over and over.
//
// It is the same failure that got a 150ms width animation deleted from
// .question-panel (see the comment in theme.css), except sustained for as
// long as someone holds the mouse down rather than for 150ms.
//
// rfb.resizeSession is a LIVE setter (rfb.js:359-364): assigning `true`
// fires one catch-up request immediately. So the entire mitigation is to
// hold it false for the duration of a gesture — scaleViewport is already
// on and rescales the frame we have, which gives a free client-side live
// preview — and assign true once on release.
//
// Structurally typed on purpose: this module must never import RFB, so
// PanelResizer can load eagerly while DesktopViewport stays lazy.
type Resizable = { resizeSession: boolean };

class DesktopResize {
  private rfb: Resizable | null = null;
  private held = 0;

  /** Called from DesktopViewport's connect handler, beside desktopClipboard. */
  attach(rfb: Resizable): void {
    this.rfb = rfb;
    // A connection that lands mid-gesture must not start resizing.
    rfb.resizeSession = this.held === 0;
  }

  detach(rfb: Resizable): void {
    if (this.rfb === rfb) this.rfb = null;
  }

  /**
   * Counted rather than boolean: a held arrow key repeating at ~30/s can
   * overlap a pointer drag, and a plain flag would let the first release
   * re-enable resizing while the other gesture is still running.
   */
  hold(): void {
    this.held += 1;
    if (this.rfb) this.rfb.resizeSession = false;
  }

  release(): void {
    this.held = Math.max(0, this.held - 1);
    // Assigning true is what fires the single catch-up resize.
    if (this.held === 0 && this.rfb) this.rfb.resizeSession = true;
  }

  /** Test-only. */
  reset(): void {
    this.rfb = null;
    this.held = 0;
  }
}

export const desktopResize = new DesktopResize();
