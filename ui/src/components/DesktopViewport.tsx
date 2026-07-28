import { useEffect, useRef, useState } from "react";
import RFB from "@novnc/novnc";
import { desktopClipboard } from "../lib/desktopClipboard";
import { desktopKeymap , isPasteChord } from "../lib/desktopKeymap";
import { desktopResize } from "../lib/desktopResize";
import { toastStore } from "./toastStore";
import { strings } from "../strings";
import { PendingBar } from "./Pending";

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
  // Lifted out of the effect closure so the overlay can name the attempt.
  // The backoff runs to an 8s ceiling and never gives up, so without a
  // number the overlay is identical on second 1 and minute 3 — the two
  // cases a candidate most needs to tell apart.
  const [attemptShown, setAttemptShown] = useState(0);

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
      // the browser. This used to call navigator.clipboard.writeText
      // directly and swallow the failure — but writeText needs transient
      // user activation and this fires on a WebSocket message, so in
      // practice it was refused most of the time and the text was simply
      // dropped. Now it is kept, and the clipboard panel offers a button
      // to take it, which is a real gesture and therefore actually works.
      rfb.addEventListener("clipboard", (event: CustomEvent<{ text: string }>) => {
        const text = event.detail?.text;
        if (text) desktopClipboard.receive(text);
      });

      rfb.addEventListener("connect", () => {
        if (disposed) return;
        attempt = 0;
        setAttemptShown(0);
        report("connected");
        // Only now can clipboardPasteFrom do anything — it is a no-op
        // until the connection is established.
        if (rfb) {
          desktopClipboard.connect(rfb);
          // The panel resizer holds resizeSession false during a drag so a
          // gesture costs one server-side framebuffer change, not one per
          // frame. See lib/desktopResize.ts.
          desktopResize.attach(rfb);
          // ⌘-chord translation for Mac keyboards. See lib/desktopKeymap.ts.
          desktopKeymap.attach(rfb);
        }
      });
      rfb.addEventListener("disconnect", () => {
        if (rfb) {
          desktopClipboard.disconnect(rfb);
          desktopResize.detach(rfb);
          desktopKeymap.detach(rfb);
        }
        if (disposed) return;
        report("disconnected");
        // The desktop container restarts during resets/switches and the
        // proxy 403s outside running sessions; keep trying quietly —
        // the parent unmounts us the moment the session leaves
        // "running", which is the real teardown path.
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
        attempt += 1;
        setAttemptShown(attempt);
        retryTimer = window.setTimeout(connect, delay);
      });
    };

    connect();

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      if (rfb) {
        desktopClipboard.disconnect(rfb);
        desktopResize.detach(rfb);
        desktopKeymap.detach(rfb);
      }
      try {
        rfb?.disconnect();
      } catch {
        // already closed — nothing to clean
      }
    };
  }, [onStateChange]);

  // Keyboard interception, in a separate effect from the RFB lifecycle so
  // the listeners survive a reconnect.
  //
  // Capture phase on the MOUNT div, deliberately. noVNC binds its own
  // keydown/keyup to the canvas it creates inside this element, and a
  // capture-phase listener on an ancestor runs before a bubble-phase
  // listener on the descendant target — so this is the only place that
  // gets to decide before noVNC has already turned ⌘ into Super. The
  // stopPropagation on a consumed event also means the window-level
  // listener in QuestionPanel never sees it.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const consume = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // Paste is special: it needs the host clipboard, which is async, so
      // it cannot go through the synchronous chord path.
      //
      // ⌘V and Ctrl+V are the same instruction here, on every platform,
      // and BOTH are consumed unconditionally — including when there is no
      // clipboard link to use. That last part is the bug this guard used
      // to have: the interception was gated on `desktopClipboard.connected`,
      // so whenever it was false a Ctrl+V fell through to noVNC, reached
      // the remote terminal as a literal Ctrl+V, and printed `^V` — the
      // readline verbatim-insert prefix — instead of pasting. Swallowing a
      // paste we cannot service is strictly better than sending the one
      // keystroke guaranteed to do the wrong thing.
      if (isPasteChord(event)) {
        consume(event);
        if (!desktopClipboard.connected) return;
        void desktopClipboard.pasteFromHost(() => desktopKeymap.sendPasteChord()).then((outcome) => {
          if (outcome === "blocked") {
            toastStore.push({
              kind: "warning",
              message: strings.clipboard.blocked,
              dedupeKey: "clipboard-blocked",
            });
          }
        });
        return;
      }
      if (desktopKeymap.handleKeyDown(event)) consume(event);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (desktopKeymap.handleKeyUp(event)) consume(event);
    };

    mount.addEventListener("keydown", onKeyDown, true);
    mount.addEventListener("keyup", onKeyUp, true);
    return () => {
      mount.removeEventListener("keydown", onKeyDown, true);
      mount.removeEventListener("keyup", onKeyUp, true);
    };
  }, []);

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
              : strings.desktop.reconnecting(attemptShown)}
          </p>
          {/* The attempt number in the line above is what carries this
              state without motion; the bar is the enhancement. */}
          <div className="desktop-status-bar">
            <PendingBar />
          </div>
        </div>
      )}
    </div>
  );
}
