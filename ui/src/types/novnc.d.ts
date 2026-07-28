// Minimal typings for @novnc/novnc's single export (core/rfb.js). Only
// the surface DesktopViewport uses is declared.
declare module "@novnc/novnc" {
  export interface RFBOptions {
    shared?: boolean;
    credentials?: { username?: string; password?: string; target?: string };
    wsProtocols?: string[];
  }

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: RFBOptions);

    resizeSession: boolean;
    scaleViewport: boolean;
    clipViewport: boolean;
    viewOnly: boolean;
    background: string;

    disconnect(): void;
    focus(): void;
    blur(): void;
    /**
     * Pushes text into the remote session's clipboard. A no-op unless
     * the connection is established and viewOnly is false.
     */
    clipboardPasteFrom(text: string): void;
    /**
     * Sends one key event. `down` omitted sends a press followed by a
     * release. `code` is a DOM KeyboardEvent.code ("KeyC", "ControlLeft")
     * and must be correct: rfb.js maps it through XtScancode when the
     * server negotiates QEMU extended key events, so the keysym alone is
     * not always what travels.
     */
    sendKey(keysym: number, code: string, down?: boolean): void;

    /** Typed overload for the "clipboard" event's CustomEvent detail. */
    addEventListener(
      type: "clipboard",
      listener: (event: CustomEvent<{ text: string }>) => void,
    ): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  }
}
