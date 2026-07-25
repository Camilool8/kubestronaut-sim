import { useEffect, useRef, useState } from "react";
import RFB from "@novnc/novnc";
import { desktopClipboard } from "../lib/desktopClipboard";
import { strings } from "../strings";

type ViewportState = "connecting" | "connected" | "disconnected";

interface DesktopViewportProps {
  onStateChange?: (state: ViewportState) => void;
}

const RECONNECT_DELAY_MS = 3_000;

// First-party VNC viewport: connects @novnc/novnc's RFB core straight to
// the facilitator's same-origin /desktop/websockify proxy — replacing the
// stock noVNC page (and its whole second design language) that used to
// live in an iframe. The parent only renders this while the session is
// running, so an unmounted viewport is a disconnected one; unexpected
// drops while mounted auto-reconnect on a fixed delay.
export function DesktopViewport({ onStateChange }: DesktopViewportProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ViewportState>("connecting");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let rfb: RFB | null = null;
    let retryTimer = 0;

    const report = (next: ViewportState) => {
      setState(next);
      onStateChange?.(next);
    };

    const connect = () => {
      if (disposed) return;
      report("connecting");

      const scheme = window.location.protocol === "https:" ? "wss" : "ws";
      rfb = new RFB(mount, `${scheme}://${window.location.host}/desktop/websockify`);
      rfb.resizeSession = true; // TigerVNC honors SetDesktopSize — fill the pane
      rfb.scaleViewport = true; // and scale while the resize settles
      rfb.background = "transparent";

      // Selections made inside the desktop follow the candidate out to
      // the browser, so copying from the terminal works in both
      // directions. TigerVNC carries UTF-8 over the extended clipboard
      // encoding; writeText can still be refused without a gesture, and
      // that is not worth surfacing.
      rfb.addEventListener("clipboard", (event: CustomEvent<{ text: string }>) => {
        const text = event.detail?.text;
        if (text) void navigator.clipboard?.writeText(text).catch(() => {});
      });

      rfb.addEventListener("connect", () => {
        if (disposed) return;
        report("connected");
        // Only now can clipboardPasteFrom do anything — it is a no-op
        // until the connection is established.
        if (rfb) desktopClipboard.connect(rfb);
      });
      rfb.addEventListener("disconnect", () => {
        if (rfb) desktopClipboard.disconnect(rfb);
        if (disposed) return;
        report("disconnected");
        // The desktop container restarts during resets/switches and the
        // proxy 403s outside running sessions; keep trying quietly —
        // the parent unmounts us the moment the session leaves
        // "running", which is the real teardown path.
        retryTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      });
    };

    connect();

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      if (rfb) desktopClipboard.disconnect(rfb);
      try {
        rfb?.disconnect();
      } catch {
        // already closed — nothing to clean
      }
    };
  }, [onStateChange]);

  return (
    <div className="desktop-viewport">
      {/* The VNC canvas swallows Tab once focused (it forwards keys to
          the remote desktop) — this visually-hidden-until-focused link
          is the documented keyboard exit, jumping to the End button. */}
      <a className="skip-link" href="#end-exam-button">
        {strings.desktop.skip}
      </a>
      <div ref={mountRef} className="desktop-canvas" />
      {state !== "connected" && (
        <div className="desktop-status" role="status">
          <p>
            {state === "connecting"
              ? strings.desktop.connecting
              : strings.desktop.reconnecting}
          </p>
        </div>
      )}
    </div>
  );
}
