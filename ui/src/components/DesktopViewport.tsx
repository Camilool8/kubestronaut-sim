import { useEffect, useRef, useState } from "react";
import RFB from "@novnc/novnc";
import { desktopClipboard } from "../lib/desktopClipboard";
import { strings } from "../strings";

type ViewportState = "connecting" | "connected" | "disconnected";

interface DesktopViewportProps {
  onStateChange?: (state: ViewportState) => void;
}

// Reconnect backoff. A desktop container restarting mid-reset is down for
// tens of seconds and the proxy 403s for the whole of it, so a flat delay
// just meant hundreds of refused WebSocket upgrades. Backs off to a ceiling
// that still feels instant to someone watching, and resets on every
// successful connect.
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 8_000;

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
    let attempt = 0;

    const report = (next: ViewportState) => {
      setState(next);
      onStateChange?.(next);
    };

    const connect = () => {
      if (disposed) return;
      report("connecting");

      const scheme = window.location.protocol === "https:" ? "wss" : "ws";
      rfb = new RFB(mount, `${scheme}://${window.location.host}/desktop/websockify`);
      // Server-side resize is the primary path: TigerVNC honors
      // SetDesktopSize, so the desktop is rendered at the pane's real
      // pixel size and text stays crisp. scaleViewport is the fallback
      // for the window between asking and being served (and for a server
      // that refuses outright) — it scales what we already have rather
      // than showing a cropped desktop. clipViewport off: never offer
      // scrollbars over the remote screen, which is the other way a
      // container can end up sized by its own content.
      rfb.resizeSession = true;
      rfb.scaleViewport = true;
      rfb.clipViewport = false;
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
        attempt = 0;
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
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
        attempt += 1;
        retryTimer = window.setTimeout(connect, delay);
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
