import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { desktopResize } from "../lib/desktopResize";
import { SPLIT_QUERY, useMediaQuery } from "../lib/useMediaQuery";
import { strings } from "../strings";

const STORAGE_KEY = "sim.panelWidth";

const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 280;
const MAX_WIDTH = 600;
const STEP = 16;
const COARSE_STEP = 64;

function clamp(px: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(px)));
}

function loadWidth(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_WIDTH;
    const parsed = Number(raw);

    if (!Number.isFinite(parsed) || parsed < MIN_WIDTH || parsed > MAX_WIDTH) {
      return DEFAULT_WIDTH;
    }
    return parsed;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function saveWidth(px: number | null): void {
  try {
    if (px === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(px));
  } catch {}
}

interface PanelResizerProps {
  panelId: string;
}

export function PanelResizer({ panelId }: PanelResizerProps) {
  const split = useMediaQuery(SPLIT_QUERY);
  const [width, setWidth] = useState(loadWidth);
  const [dragging, setDragging] = useState(false);
  const handleRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; width: number } | null>(null);
  const holding = useRef(false);

  const applyWidth = useCallback((px: number) => {
    document.documentElement.style.setProperty("--panel-width", `${px}px`);
  }, []);

  useLayoutEffect(() => {
    applyWidth(width);
  }, [applyWidth, width]);

  const hold = useCallback(() => {
    if (holding.current) return;
    holding.current = true;
    desktopResize.hold();
  }, []);

  const release = useCallback(() => {
    if (!holding.current) return;
    holding.current = false;
    desktopResize.release();
  }, []);

  const commit = useCallback((px: number) => {
    const next = clamp(px);
    setWidth(next);
    saveWidth(next);
    return next;
  }, []);

  if (!split) return null;

  const setResizingAttr = (on: boolean) => {
    const body = handleRef.current?.closest(".exam-body");
    if (!body) return;
    if (on) body.setAttribute("data-resizing", "true");
    else body.removeAttribute("data-resizing");
  };

  const endDrag = (element: HTMLElement, pointerId: number) => {
    dragStart.current = null;
    setDragging(false);
    setResizingAttr(false);
    try {
      element.releasePointerCapture(pointerId);
    } catch {}
    release();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const element = event.currentTarget;

    element.setPointerCapture(event.pointerId);
    dragStart.current = { x: event.clientX, width };
    setDragging(true);
    setResizingAttr(true);
    hold();
    event.preventDefault();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;

    applyWidth(clamp(start.width + (event.clientX - start.x)));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    commit(start.width + (event.clientX - start.x));
    endDrag(event.currentTarget, event.pointerId);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && dragStart.current) {
      applyWidth(dragStart.current.width);
      setWidth(dragStart.current.width);
      endDrag(event.currentTarget, -1);
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const delta = event.shiftKey ? COARSE_STEP : STEP;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = width - delta;
    else if (event.key === "ArrowRight") next = width + delta;
    else if (event.key === "Home") next = MIN_WIDTH;
    else if (event.key === "End") next = MAX_WIDTH;

    if (next === null) return;

    event.preventDefault();

    hold();
    commit(next);
  };

  return (
    <div
      ref={handleRef}
      className="panel-resizer"
      role="separator"
      tabIndex={0}

      aria-orientation="vertical"
      aria-controls={panelId}
      aria-valuenow={width}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      aria-valuetext={strings.exam.resizePanelValue(width)}
      aria-label={strings.exam.resizePanel}
      data-dragging={dragging ? "true" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}

      onLostPointerCapture={release}
      onKeyDown={onKeyDown}
      onKeyUp={release}
      onDoubleClick={() => {
        setWidth(DEFAULT_WIDTH);
        saveWidth(null);
      }}
    />
  );
}
