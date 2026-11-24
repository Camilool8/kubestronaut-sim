import { useEffect, useRef, useState, type MouseEvent } from "react";
import RFB from "@novnc/novnc";
import type { SessionSnapshot } from "../api";
import { desktopClipboard } from "../lib/desktopClipboard";
import { desktopKeymap, isPasteChord } from "../lib/desktopKeymap";
import { desktopResize } from "../lib/desktopResize";
import { useExamClock } from "../lib/useExamClock";
import { toastStore } from "./toastStore";
import { strings } from "../strings";
import { PendingBar } from "./Pending";
import { TimerReadout } from "./TimerReadout";
import { END_EXAM_BUTTON_ID } from "./TimerBar";

type ViewportState = "connecting" | "connected" | "disconnected";

interface DesktopViewportProps {
  session: SessionSnapshot;
  fetchedAt: number;
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 8_000;
export const ESCALATE_AFTER_ATTEMPTS = 5;
export const ESCALATE_AFTER_MS = 30_000;

export function isLeaveChord(event: KeyboardEvent): boolean {
  return (
    (event.key === "End" || event.code === "End") &&
    event.ctrlKey &&
    event.altKey &&
    event.shiftKey &&
    !event.metaKey
  );
}

export function DesktopViewport({ session, fetchedAt }: DesktopViewportProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLAnchorElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const [state, setState] = useState<ViewportState>("connecting");
  const [lost, setLost] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [everLost, setEverLost] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let rfb: RFB | null = null;
    let retryTimer = 0;
    let attempt = 0;

    const release = (target: RFB) => {
      desktopClipboard.disconnect(target);
      desktopResize.detach(target);
      desktopKeymap.detach(target);
    };

    const fail = () => {
      if (disposed) return;
      rfbRef.current = null;
      setState("disconnected");
      setLost(true);
      setEverLost(true);
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
      attempt += 1;
      if (attempt >= ESCALATE_AFTER_ATTEMPTS) setStuck(true);
      retryTimer = window.setTimeout(connect, delay);
    };

    const connect = () => {
      if (disposed) return;
      setState("connecting");

      const scheme = window.location.protocol === "https:" ? "wss" : "ws";
      try {
        rfb = new RFB(mount, `${scheme}://${window.location.host}/desktop/websockify`);
      } catch {
        rfb = null;
        fail();
        return;
      }
      const current = rfb;
      rfbRef.current = current;

      current.resizeSession = true;
      current.scaleViewport = true;
      current.clipViewport = false;
      current.background = "transparent";

      current.addEventListener("clipboard", (event: CustomEvent<{ text: string }>) => {
        const text = event.detail?.text;
        if (text) desktopClipboard.receive(text);
      });

      current.addEventListener("connect", () => {
        if (disposed) return;
        attempt = 0;
        setState("connected");
        setLost(false);
        setStuck(false);
        desktopClipboard.connect(current);
        desktopResize.attach(current);
        desktopKeymap.attach(current);
      });
      current.addEventListener("disconnect", () => {
        release(current);
        fail();
      });
    };

    connect();

    return () => {
      disposed = true;
      rfbRef.current = null;
      window.clearTimeout(retryTimer);
      if (rfb) release(rfb);
      try {
        rfb?.disconnect();
      } catch {}
    };
  }, [reloads]);

  useEffect(() => {
    if (!lost || stuck) return;
    const timer = window.setTimeout(() => setStuck(true), ESCALATE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [lost, stuck]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const consume = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isLeaveChord(event)) {
        consume(event);
        window.dispatchEvent(new Event("blur"));
        skipRef.current?.focus();
        return;
      }
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

  const skipPast = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById(END_EXAM_BUTTON_ID)?.focus();
  };

  const enterDesktop = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) rfbRef.current?.focus();
  };

  const announcement = lost
    ? stuck
      ? strings.desktop.announceStuck
      : strings.desktop.announceLost
    : everLost
      ? strings.desktop.announceRestored
      : "";

  const reloadDesktop = () => {
    setReloads((n) => n + 1);
  };

  return (
    <div className="desktop-viewport">
      <a ref={skipRef} className="skip-link" href={`#${END_EXAM_BUTTON_ID}`} onClick={skipPast}>
        {strings.desktop.skip}
      </a>
      <div
        ref={mountRef}
        className="desktop-canvas"
        tabIndex={0}
        role="group"
        aria-label={strings.desktop.regionLabel}
        onFocus={enterDesktop}
      />
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {announcement}
      </div>
      {state !== "connected" &&
        (lost ? (
          <DesktopLost
            session={session}
            fetchedAt={fetchedAt}
            stuck={stuck}
            onReload={reloadDesktop}
          />
        ) : (
          <div className="desktop-status" role="status">
            <p>{strings.desktop.connecting}</p>
            <div className="desktop-status-bar">
              <PendingBar />
            </div>
          </div>
        ))}
    </div>
  );
}

interface DesktopLostProps {
  session: SessionSnapshot;
  fetchedAt: number;
  stuck: boolean;
  onReload: () => void;
}

function DesktopLost({ session, fetchedAt, stuck, onReload }: DesktopLostProps) {
  const { remaining, elapsed, untimed } = useExamClock(session, fetchedAt);

  return (
    <div className="desktop-status desktop-lost">
      <div className="desktop-lost-card">
        <h2 className="desktop-lost-title">{strings.desktop.lostTitle}</h2>
        <p>{strings.desktop.lostWorkSafe}</p>
        <p className="desktop-lost-clock">
          <span>{untimed ? strings.desktop.lostClockUntimed : strings.desktop.lostClockTimed}</span>
          <span className="desktop-lost-time">
            <TimerReadout untimed={untimed} remaining={remaining} elapsed={elapsed} />
          </span>
        </p>
        <div className="desktop-lost-retry">
          <span>{strings.desktop.lostRetrying}</span>
          <div className="desktop-status-bar">
            <PendingBar />
          </div>
        </div>
        {stuck && (
          <div className="desktop-lost-stuck">
            <h3 className="desktop-lost-subtitle">{strings.desktop.stuckTitle}</h3>
            <p>{strings.desktop.stuckCause}</p>
            <p>{strings.desktop.stuckKeepWorking}</p>
            <button type="button" className="btn btn-primary" onClick={onReload}>
              {strings.desktop.reload}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
