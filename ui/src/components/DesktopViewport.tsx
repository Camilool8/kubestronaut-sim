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

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 8_000;

export function DesktopViewport({ onStateChange }: DesktopViewportProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ViewportState>("connecting");

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

      rfb.resizeSession = true;
      rfb.scaleViewport = true;
      rfb.clipViewport = false;
      rfb.background = "transparent";

      rfb.addEventListener("clipboard", (event: CustomEvent<{ text: string }>) => {
        const text = event.detail?.text;
        if (text) desktopClipboard.receive(text);
      });

      rfb.addEventListener("connect", () => {
        if (disposed) return;
        attempt = 0;
        setAttemptShown(0);
        report("connected");

        if (rfb) {
          desktopClipboard.connect(rfb);

          desktopResize.attach(rfb);

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
      } catch {}
    };
  }, [onStateChange]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const consume = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const onKeyDown = (event: KeyboardEvent) => {
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

          <div className="desktop-status-bar">
            <PendingBar />
          </div>
        </div>
      )}
    </div>
  );
}
