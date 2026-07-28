import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { desktopResize } from "../lib/desktopResize";
import { SPLIT_QUERY, useMediaQuery } from "../lib/useMediaQuery";
import { strings } from "../strings";

// A UI preference, so localStorage beside sim.theme rather than the
// sessionStorage the per-attempt marks use.
const STORAGE_KEY = "sim.panelWidth";

// Mirrors the clamp on .question-panel in theme.css. Kept in both places
// on purpose: CSS enforces it against the viewport (which JS never sees
// without a listener), JS enforces it against the pointer.
const DEFAULT_WIDTH = 360;
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
    // A value from an older build, a hand-edited key, or a different
    // screen must not be able to render the panel unusable.
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
  } catch {
    // Storage can be disabled outright. Losing a panel width is a
    // downgrade the exam absorbs; throwing out of a pointer handler is not.
  }
}

interface PanelResizerProps {
  /** id of the panel being resized, for aria-controls. */
  panelId: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// The draggable boundary between the question panel and the remote
// desktop. Follows the APG window-splitter pattern: a focusable
// role="separator" carrying its own value, operable by pointer AND by
// keyboard, because this codebase has no mouse-only controls and a
// 44px coarse-pointer floor.
//
// The width is written to a CSS custom property imperatively during a
// drag and committed to React state only on release. That is deliberate:
// re-rendering Exam at 60fps would re-render QuestionPanel, and
// <Markdown> re-parsing the question through react-markdown + remark-gfm
// sixty times a second is real work for no benefit.
export function PanelResizer({ panelId, collapsed, onToggleCollapse }: PanelResizerProps) {
  const split = useMediaQuery(SPLIT_QUERY);
  const [width, setWidth] = useState(loadWidth);
  const [dragging, setDragging] = useState(false);
  const handleRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; width: number } | null>(null);
  const holding = useRef(false);

  // On the document root, not on a container ref. Custom properties
  // inherit, so .question-panel picks it up either way — but a child's
  // layout effect runs BEFORE its parent's ref is attached, so writing to
  // an ancestor ref here silently did nothing on the very first commit,
  // which is exactly the paint a stored width needs to be correct for.
  const applyWidth = useCallback((px: number) => {
    document.documentElement.style.setProperty("--panel-width", `${px}px`);
  }, []);

  // Before paint, so a stored width never shows as a 360px flash. The CSS
  // fallback var(--panel-width, 360px) covers the frame before this runs.
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
    // Resolved from the handle rather than a ref, so there is no second
    // place for the mount-order trap above to reappear.
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
    } catch {
      // Already released, or the capture was lost — either is fine.
    }
    release();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const element = event.currentTarget;
    // Mandatory, not polish: noVNC binds raw mousedown/mousemove/mouseup
    // and a focusCanvas handler on its own canvas, so a drag released over
    // the desktop would inject a click into the live remote session and
    // steal the keyboard into it.
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
    // Imperative: no setState per frame. See the note above the component.
    applyWidth(clamp(start.width + (event.clientX - start.x)));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    commit(start.width + (event.clientX - start.x));
    endDrag(event.currentTarget, event.pointerId);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Escape mid-drag puts the edge back where it was.
    if (event.key === "Escape" && dragStart.current) {
      applyWidth(dragStart.current.width);
      setWidth(dragStart.current.width);
      endDrag(event.currentTarget, -1);
      return;
    }

    // Same guard QuestionPanel's global handler uses. Without it, ⌘→ or
    // Ctrl+Home while this separator has focus resized the panel AND
    // preventDefault'd the browser's own shortcut — so a Mac candidate
    // reaching for "end of line" moved the divider instead. Shift is
    // deliberately still allowed: Shift+Arrow is this control's own
    // coarse step.
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const delta = event.shiftKey ? COARSE_STEP : STEP;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = width - delta;
    else if (event.key === "ArrowRight") next = width + delta;
    else if (event.key === "Home") next = MIN_WIDTH;
    else if (event.key === "End") next = MAX_WIDTH;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggleCollapse();
      return;
    }
    if (next === null) return;

    event.preventDefault();
    // Held down, an arrow repeats ~30 times a second. hold() is idempotent
    // and release() waits for keyup, so the whole burst is one server resize.
    hold();
    commit(next);
  };

  return (
    <div
      ref={handleRef}
      className="panel-resizer"
      role="separator"
      tabIndex={0}
      // A separator's implicit orientation is horizontal, so a vertical
      // one has to say so.
      aria-orientation="vertical"
      aria-controls={panelId}
      aria-valuenow={width}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      aria-valuetext={strings.exam.resizePanelValue(width)}
      aria-label={strings.exam.resizePanel}
      data-dragging={dragging ? "true" : undefined}
      aria-disabled={collapsed || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // A capture stolen by the browser (a context menu, a tab switch)
      // must not strand resizeSession false for the rest of the session.
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
