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
    clipboardPasteFrom(text: string): void;
  }
}
