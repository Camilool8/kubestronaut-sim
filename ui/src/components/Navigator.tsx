import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFocusTrap } from "../lib/useFocusTrap";
import { Icon } from "./Icon";
import { marksStore } from "./marksStore";
import { strings } from "../strings";

export type NavigatorProgress = "opened" | "answered";

export interface NavigatorQuestion {
  id: string;

  label: string;

  detail?: string;

  done: boolean;
}

interface NavigatorProps {
  id: string;
  questions: NavigatorQuestion[];
  selectedId: string | null;
  progress: NavigatorProgress;
  onSelect: (id: string) => void;
  onDismiss: () => void;

  asSheet?: boolean;
}

type NavigatorFilter = "all" | "flagged" | "todo";

const COLUMNS = 10;

const TYPE_AHEAD_MS = 800;

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

  useSyncExternalStore(marksStore.subscribe, marksStore.getVersion);

  useFocusTrap(ref, onDismiss, asSheet);

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

  useEffect(() => () => window.clearTimeout(typeAhead.current.timer), []);

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

    if (event.key >= "0" && event.key <= "9" && event.key.length === 1) {
      event.preventDefault();

      window.clearTimeout(typeAhead.current.timer);

      const extended = typeAhead.current.digits + event.key;

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

                  tabIndex={i === activeIndex ? 0 : -1}
                  onFocus={() => setActiveId(q.id)}
                  onClick={() => onSelect(q.id)}
                  aria-current={current ? "true" : undefined}
                >
                  <span className="navigator-tile-label">{q.label}</span>
                  {flagged && <Icon name="flag-filled" className="navigator-tile-flag" />}
                  {" "}
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

function FilterChip({ on, count, onPick, children }: FilterChipProps) {
  return (
    <button className="navigator-chip" aria-pressed={on} onClick={onPick}>
      {children}{" "}
      <span className="navigator-chip-count">{count}</span>
    </button>
  );
}

function Legend({ variant, children }: { variant: string; children: React.ReactNode }) {
  return (
    <li>
      <span className={`navigator-swatch navigator-swatch-${variant}`} aria-hidden="true" />
      {children}
    </li>
  );
}
