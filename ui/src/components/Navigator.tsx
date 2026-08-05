import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFocusTrap } from "../lib/useFocusTrap";
import { Icon } from "./Icon";
import { marksStore } from "./marksStore";
import { strings } from "../strings";

// Every question at once: filter chips, a grid of numbered tiles, a legend
// naming the four tile states, and the keys that work while it is open.
//
// One component behind both exam engines. It used to be two — QuestionJump
// inside QuestionPanel and McqJump inside McqExam — which had drifted into
// two answers to the same question (one grouped tiles under domain
// headings and printed points, the other printed positions and a check
// mark), so a fix to either only ever landed on half the product.
//
// It is absolutely positioned INSIDE its host, which is load-bearing
// rather than incidental: opening it changes no flex geometry, so
// .desktop-pane never resizes, so noVNC's ResizeObserver never fires. Both
// hosts are already position: relative for exactly this (.question-panel
// and .mcq-question). It is also why this is a disclosure and not a modal
// — no scrim, no role="dialog", no focus trap. Dimming a live remote
// desktop to pick question 12 would read as something going wrong.

/**
 * What the middle tile state means on this surface.
 *
 * The two engines know different things and must not borrow each other's
 * words. The mcq screen holds a copy of the server's answer sheet, so
 * "answered" is a fact it can check. The hands-on screen only knows this
 * tab rendered the question's text, and marksStore.ts forbids that ever
 * being called answered, attempted or complete — that would be the
 * interface making a claim the grader has not checked.
 */
export type NavigatorProgress = "opened" | "answered";

export interface NavigatorQuestion {
  /** Stable identity, and what onSelect hands back: the bank's id. */
  id: string;
  /**
   * What the tile prints. The hands-on side passes the bank id, because
   * that is what its own nav header names the question. The mcq side
   * passes the attempt position (Q7): there the bank id is an artifact of
   * the pool a random draw sampled from, and never renders anywhere.
   */
  label: string;
  /**
   * Announced after the label and never drawn. Ten tiles to a row leaves
   * one line, and it belongs to the number; the domain, the instance, the
   * points and the bank's title travel here instead of being dropped.
   */
  detail?: string;
  /** True once the candidate has engaged with it, in `progress`'s sense. */
  done: boolean;
}

interface NavigatorProps {
  /** The DOM id the opening trigger's aria-controls points at. */
  id: string;
  questions: NavigatorQuestion[];
  selectedId: string | null;
  progress: NavigatorProgress;
  onSelect: (id: string) => void;
  onDismiss: () => void;
  /**
   * Present it as a modal bottom sheet rather than a panel inside its
   * host: scrim, `role="dialog"`, focus trap, tap-outside to dismiss.
   *
   * Set by the mcq screen on a phone, and by nothing else. The comment
   * above explains why this component is normally a disclosure — a
   * scrim over a live remote desktop reads as something going wrong —
   * and that reasoning is about the remote desktop. There is none behind
   * an mcq question. What IS behind it on a phone is the whole viewport,
   * because sixty-five tiles at a coarse-pointer size do not fit in a
   * box inside the column; and an overlay that covers the screen while
   * leaving what it covers reachable is the definition of the thing a
   * focus trap exists for.
   */
  asSheet?: boolean;
}

type NavigatorFilter = "all" | "flagged" | "todo";

// Ten to a row is the grid's whole premise: row two starts at eleven, so a
// position is found by counting rows instead of reading every tile. The
// tiles size to the container rather than the other way round, so the same
// ten columns are ~30px wide in a 360px question panel and ~70px in the
// mcq screen's 760px column.
const COLUMNS = 10;

// How long a second digit still counts as part of the first. Long enough
// to type "34" without hurrying, short enough that a digit typed after a
// pause means what it says.
const TYPE_AHEAD_MS = 800;

/**
 * The row step for the up and down arrows. The real track list is the
 * authority, because the coarse-pointer layout drops to five columns — but
 * jsdom has no CSS engine and reports nothing at all, so the design's own
 * ten is the fallback rather than a silent step of one.
 */
function rowStep(grid: HTMLElement | null): number {
  const tracks = grid ? getComputedStyle(grid).gridTemplateColumns.trim() : "";
  const count = tracks ? tracks.split(/\s+/).length : 0;
  return count > 1 ? count : COLUMNS;
}

export function Navigator({
  id,
  questions,
  selectedId,
  progress,
  onSelect,
  onDismiss,
  asSheet = false,
}: NavigatorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLUListElement>(null);
  const tiles = useRef(new Map<string, HTMLButtonElement>());
  const typeAhead = useRef({ digits: "", timer: 0 });
  const restoreFocus = useRef(false);
  const [filter, setFilter] = useState<NavigatorFilter>("all");
  const [activeId, setActiveId] = useState<string | null>(
    selectedId ?? questions[0]?.id ?? null,
  );

  // Subscribing to the version counter rather than the sets themselves:
  // useSyncExternalStore needs a snapshot whose identity is stable between
  // notifications, and a mutable Set is not that.
  useSyncExternalStore(marksStore.subscribe, marksStore.getVersion);

  // As a panel this is a non-modal disclosure, and useFocusTrap is the
  // wrong tool despite being right next door: it cycles Tab inside the
  // container, which would strand a keyboard user who wanted to reach the
  // timer or Submit exam. As a sheet it covers the viewport, and the
  // same cycling is the only thing keeping Tab out of the question
  // behind it.
  //
  // Declared BEFORE the effect below, so that when both run the tile
  // wins: effects fire in declaration order, and the trap's own opening
  // focus lands on the first filter chip. The grid should arrive
  // pointing at your place either way.
  useFocusTrap(ref, onDismiss, asSheet);

  // Focus opens on the question you are on, so the grid arrives already
  // pointing at your place.
  useEffect(() => {
    const grid = gridRef.current;
    const target =
      grid?.querySelector<HTMLElement>('[aria-current="true"]') ??
      grid?.querySelector<HTMLElement>("button");
    target?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onDismiss();
    };
    const node = ref.current;
    node?.addEventListener("keydown", onKeyDown);
    return () => node?.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  // The digit buffer outlives a close if nobody clears it.
  useEffect(() => () => window.clearTimeout(typeAhead.current.timer), []);

  // Unflagging the tile you are standing on under the flagged filter takes
  // that tile out of the grid, and the focus goes to <body> with it.
  // activeId is moved to the neighbour before the store is told, so this
  // only has to put the focus back where the state already points.
  useLayoutEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    if (activeId) tiles.current.get(activeId)?.focus();
  });

  const flaggedCount = questions.filter((q) => marksStore.isMarked(q.id)).length;
  const todoCount = questions.filter((q) => !q.done).length;
  const visible = questions.filter((q) =>
    filter === "flagged"
      ? marksStore.isMarked(q.id)
      : filter === "todo"
        ? !q.done
        : true,
  );

  // A filter can hide the tile the roving tabindex is parked on. Falling
  // back to the first visible tile keeps exactly one tile Tab-reachable,
  // which is the whole contract of a roving tabindex.
  const found = visible.findIndex((q) => q.id === activeId);
  const activeIndex = found === -1 ? 0 : found;

  const focusTile = (target: string | undefined) => {
    if (!target) return;
    setActiveId(target);
    tiles.current.get(target)?.focus();
  };

  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const step = (delta: number) => {
      event.preventDefault();
      const next = Math.min(visible.length - 1, Math.max(0, activeIndex + delta));
      focusTile(visible[next]?.id);
    };

    switch (event.key) {
      case "ArrowRight":
        return step(1);
      case "ArrowLeft":
        return step(-1);
      case "ArrowDown":
        return step(rowStep(gridRef.current));
      case "ArrowUp":
        return step(-rowStep(gridRef.current));
      case "Home":
        event.preventDefault();
        return focusTile(visible[0]?.id);
      case "End":
        event.preventDefault();
        return focusTile(visible[visible.length - 1]?.id);
    }

    // F flags the tile the focus is on, not the question on screen. The
    // grid is where a candidate triages, and reaching back to the header's
    // Mark for review to flag question 14 while looking at question 3 is
    // the round trip this key removes.
    if (event.key === "f" || event.key === "F") {
      const target = visible[activeIndex];
      if (!target) return;
      event.preventDefault();
      if (filter === "flagged" && marksStore.isMarked(target.id)) {
        const neighbour = visible[activeIndex + 1] ?? visible[activeIndex - 1];
        if (neighbour) setActiveId(neighbour.id);
        restoreFocus.current = true;
      }
      marksStore.toggleMark(target.id);
      return;
    }

    // Digits move the focus rather than committing: a 65-question bank
    // needs two keystrokes to reach Q34, and selecting on the first would
    // close the grid before the second arrived. Enter or Space then opens
    // it, which is a plain button doing what buttons do.
    if (event.key >= "0" && event.key <= "9" && event.key.length === 1) {
      event.preventDefault();
      // A pending timer means the previous digit is still open, so this
      // one extends it. A timer measures the gap rather than two
      // Date.now() readings because the React compiler's purity rule
      // (correctly) refuses a clock call inside a component body.
      window.clearTimeout(typeAhead.current.timer);
      // The nth tile SHOWING, not the nth question in the bank: under a
      // filter the two differ, and "the third tile" is the one a candidate
      // can actually count.
      const extended = typeAhead.current.digits + event.key;
      // 7 then 1 on a 12-tile grid means question one, not a dead 71. The
      // buffer follows the fallback so the next digit builds on what the
      // focus actually did.
      const digits = visible[Number(extended) - 1] ? extended : event.key;
      typeAhead.current = {
        digits,
        timer: window.setTimeout(() => {
          typeAhead.current = { digits: "", timer: 0 };
        }, TYPE_AHEAD_MS),
      };
      focusTile(visible[Number(digits) - 1]?.id);
    }
  };

  const doneWord =
    progress === "answered" ? strings.navigator.answered : strings.navigator.opened;
  const todoWord =
    progress === "answered" ? strings.navigator.unanswered : strings.navigator.unseen;
  const todoChip =
    progress === "answered"
      ? strings.navigator.filterUnanswered
      : strings.navigator.filterUnseen;
  const emptyNote =
    filter === "flagged"
      ? strings.navigator.emptyFlagged
      : progress === "answered"
        ? strings.navigator.emptyUnanswered
        : strings.navigator.emptyUnseen;

  const panel = (
    <div
      className={`navigator${asSheet ? " navigator-sheet" : ""}`}
      id={id}
      ref={ref}
      role={asSheet ? "dialog" : undefined}
      aria-modal={asSheet ? true : undefined}
      aria-label={asSheet ? strings.navigator.regionLabel : undefined}
    >
      {asSheet && <span className="sheet-grip" aria-hidden="true" />}
      <header className="navigator-head">
        <div
          className="navigator-filters"
          role="group"
          aria-label={strings.navigator.filterLabel}
        >
          <FilterChip
            on={filter === "all"}
            count={questions.length}
            onPick={() => setFilter("all")}
          >
            {strings.navigator.filterAll}
          </FilterChip>
          <FilterChip
            on={filter === "flagged"}
            count={flaggedCount}
            onPick={() => setFilter("flagged")}
          >
            {/* The flag is drawn, not typed. @fontsource declares a
                unicode-range per @font-face and ⚑ is outside every one of
                them, so the codepoint would never reach the woff2. */}
            <Icon name="flag" />
            <span className="sr-only">{strings.navigator.filterFlagged}</span>
          </FilterChip>
          <FilterChip
            on={filter === "todo"}
            count={todoCount}
            onPick={() => setFilter("todo")}
          >
            {todoChip}
          </FilterChip>
        </div>
      </header>

      <div className="navigator-body">
        <ul
          className="navigator-grid"
          role="list"
          aria-label={strings.navigator.regionLabel}
          ref={gridRef}
          onKeyDown={onGridKeyDown}
        >
          {visible.map((q, i) => {
            const current = q.id === selectedId;
            const flagged = marksStore.isMarked(q.id);
            const classes = ["navigator-tile"];
            if (q.done) classes.push("is-done");
            if (flagged) classes.push("is-flagged");
            return (
              <li key={q.id}>
                <button
                  className={classes.join(" ")}
                  ref={(node) => {
                    if (node) tiles.current.set(q.id, node);
                    else tiles.current.delete(q.id);
                  }}
                  // One tile in the grid is Tab-reachable and the arrows
                  // move between the rest, so Tab still crosses the grid
                  // in one press instead of sixty-five.
                  tabIndex={i === activeIndex ? 0 : -1}
                  onFocus={() => setActiveId(q.id)}
                  onClick={() => onSelect(q.id)}
                  aria-current={current ? "true" : undefined}
                >
                  <span className="navigator-tile-label">{q.label}</span>
                  {flagged && <Icon name="flag-filled" className="navigator-tile-flag" />}
                  {/* The space is load-bearing: without it the accessible
                      name runs the label into the detail as one token, and
                      a screen reader says "Q5Kubernetes". */}{" "}
                  <span className="sr-only">
                    {[q.detail, q.done ? doneWord : todoWord, flagged ? strings.navigator.flagged : null]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {/* A filter that matches nothing says why rather than leaving a
            blank box that reads as a broken grid. */}
        {visible.length === 0 && <p className="navigator-empty">{emptyNote}</p>}
      </div>

      <footer className="navigator-foot">
        <ul className="navigator-legend">
          <Legend variant="current">{strings.navigator.legendCurrent}</Legend>
          <Legend variant="done">
            {progress === "answered"
              ? strings.navigator.legendAnswered
              : strings.navigator.legendOpened}
          </Legend>
          <Legend variant="flagged">{strings.navigator.legendFlagged}</Legend>
          <Legend variant="unseen">
            {progress === "answered"
              ? strings.navigator.legendUnanswered
              : strings.navigator.legendUnseen}
          </Legend>
        </ul>
        <p className="navigator-keys">
          <span>
            <kbd>
              <Icon name="chevron-left" />
              <span className="sr-only">{strings.navigator.keyLeft}</span>
            </kbd>
            <kbd>
              <Icon name="chevron-right" />
              <span className="sr-only">{strings.navigator.keyRight}</span>
            </kbd>
            {strings.navigator.keyMove}
          </span>
          <span>
            <kbd>{strings.navigator.keyFlagKey}</kbd>
            {strings.navigator.keyFlag}
          </span>
          <span>
            <kbd>{strings.navigator.keyGridKey}</kbd>
            {strings.navigator.keyGrid}
          </span>
          <span>
            <kbd>{strings.navigator.keyDigits}</kbd>
            {strings.navigator.keyJump}
          </span>
        </p>
      </footer>
    </div>
  );

  if (!asSheet) return panel;
  return (
    <>
      {/* Tapping away is how a sheet is dismissed on a phone, and it has
          to be a real target rather than a click handler on the scrim
          colour alone. aria-hidden with no role: the dialog above it is
          the thing, and an announced "button" here would be a second way
          to say close that the sheet's own controls already cover. */}
      <div className="navigator-scrim" aria-hidden="true" onClick={onDismiss} />
      {panel}
    </>
  );
}

interface FilterChipProps {
  on: boolean;
  count: number;
  onPick: () => void;
  children: React.ReactNode;
}

// aria-pressed rather than a radio group: three buttons in a labelled
// group is the pattern a screen reader already knows, and a radiogroup
// would want its own arrow-key roving fighting the grid's below it.
function FilterChip({ on, count, onPick, children }: FilterChipProps) {
  return (
    <button className="navigator-chip" aria-pressed={on} onClick={onPick}>
      {children}{" "}
      <span className="navigator-chip-count">{count}</span>
    </button>
  );
}

// The swatch is a miniature of the tile it names, drawn from the same
// border and fill tokens the grid uses. A legend whose swatch is not the
// real thing teaches the wrong mapping.
function Legend({ variant, children }: { variant: string; children: React.ReactNode }) {
  return (
    <li>
      <span className={`navigator-swatch navigator-swatch-${variant}`} aria-hidden="true" />
      {children}
    </li>
  );
}
