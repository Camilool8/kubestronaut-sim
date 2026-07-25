import { useEffect, useRef, useState } from "react";
import { strings } from "../strings";

export interface TourStep {
  /** CSS selector of the element to spotlight. */
  target: string;
  title: string;
  body: string;
}

interface TourProps {
  steps: TourStep[];
  onDone: () => void;
}

const TOUR_DONE_KEY = "sim.tourDone";

export function tourSeen(): boolean {
  return localStorage.getItem(TOUR_DONE_KEY) === "1";
}

export function markTourSeen(): void {
  localStorage.setItem(TOUR_DONE_KEY, "1");
}

export function resetTourSeen(): void {
  localStorage.removeItem(TOUR_DONE_KEY);
}

// First-run walkthrough: a spotlight ring around each target (the
// box-shadow scrim trick — one element, no canvas) with a step card
// beside it. Skippable at any point; Escape skips; finishing or skipping
// marks it seen. Deliberately dependency-free (~100 lines).
export function Tour({ steps, onDone }: TourProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = steps[index];

  useEffect(() => {
    const el = step ? document.querySelector(step.target) : null;
    setRect(el ? el.getBoundingClientRect() : null);
    // keyboard users follow the tour from the card itself
    cardRef.current?.focus();
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  if (!step) return null;

  const spotlight = rect
    ? {
        top: rect.top - 6,
        left: rect.left - 6,
        width: rect.width + 12,
        height: rect.height + 12,
      }
    : { top: 0, left: 0, width: 0, height: 0 };

  // Card sits under the target when there's room, else above.
  const cardBelow = rect ? rect.bottom + 180 < window.innerHeight : true;
  const cardStyle = rect
    ? cardBelow
      ? { top: rect.bottom + 14, left: Math.min(rect.left, window.innerWidth - 360) }
      : { bottom: window.innerHeight - rect.top + 14, left: Math.min(rect.left, window.innerWidth - 360) }
    : { top: "40%", left: "50%" };

  const last = index === steps.length - 1;

  return (
    <div className="tour-layer">
      <div className="tour-spotlight" style={spotlight} aria-hidden="true" />
      <div
        ref={cardRef}
        tabIndex={-1}
        className="tour-card"
        style={cardStyle}
        role="dialog"
        aria-label={step.title}
      >
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-actions">
          <span className="tour-progress">
            {strings.tour.progress(index + 1, steps.length)}
          </span>
          <button className="btn" onClick={onDone}>
            {strings.tour.skip}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => (last ? onDone() : setIndex(index + 1))}
          >
            {last ? strings.tour.done : strings.tour.next}
          </button>
        </div>
      </div>
    </div>
  );
}
