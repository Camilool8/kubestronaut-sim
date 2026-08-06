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

    sendKey(keysym: number, code: string, down?: boolean): void;

    addEventListener(
      type: "clipboard",
      listener: (event: CustomEvent<{ text: string }>) => void,
    ): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  }
}
