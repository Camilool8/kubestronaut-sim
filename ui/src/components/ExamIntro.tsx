import { Dialog } from "./Dialog";
import { strings } from "../strings";

const INTRO_SEEN_KEY = "sim.tourDone";

export function introSeen(): boolean {
  return localStorage.getItem(INTRO_SEEN_KEY) === "1";
}

export function markIntroSeen(): void {
  localStorage.setItem(INTRO_SEEN_KEY, "1");
}

export function resetIntroSeen(): void {
  localStorage.removeItem(INTRO_SEEN_KEY);
}

// The first-run explainer. This replaces a spotlight tour that measured
// each target once with getBoundingClientRect() and positioned a card
// beside it — an approach that could not work here. Two of its four
// targets (the question panel and the desktop pane) are full-height
// regions, and for those the "no room below, so place it above" branch
// resolved to `bottom: innerHeight - rect.top`, which puts the card
// entirely off the top of the screen. Half the tour was invisible by
// construction, and the measurement was never refreshed on resize.
//
// So it does not point at the running layout at all. It *draws* the
// layout: a static schematic with numbered regions, and a legend keyed
// to the same numbers. Nothing to measure, nothing to re-measure,
// nothing that can land off-screen; it reads the same at 1440px and at
// 900px, and it is renderable (and therefore testable) without a live
// exam behind it, which is also why the lobby can show it before the
// clock starts.
export function ExamIntro({ onClose }: { onClose: () => void }) {
  const s = strings.intro;

  return (
    <Dialog title={s.title} onClose={onClose} wide>
      <div className="intro-schematic" role="img" aria-label={s.schematicAlt}>
        <div className="intro-topbar">
          <span className="intro-region-label">3</span>
          <span className="intro-chip intro-chip-timer">{s.diagramTimer}</span>
          <span className="intro-region-label">4</span>
          <span className="intro-chip intro-chip-end">{s.diagramEnd}</span>
        </div>
        <div className="intro-body">
          <div className="intro-panel">
            <span className="intro-region-label">1</span>
            <span className="intro-region-name">{s.diagramQuestions}</span>
          </div>
          <div className="intro-desktop">
            <span className="intro-region-label">2</span>
            <span className="intro-region-name">{s.diagramDesktop}</span>
          </div>
        </div>
      </div>

      <ol className="intro-legend">
        {s.legend.map((item, i) => (
          <li key={item.title}>
            <span className="intro-legend-number" aria-hidden="true">
              {i + 1}
            </span>
            <div>
              <strong>{item.title}</strong> — {item.body}
            </div>
          </li>
        ))}
      </ol>

      {/* Below the legend and outside it: the legend's numbers key to the
          four regions on the schematic, and grading is not one of them. */}
      <section className="intro-note" aria-label={s.methodTitle}>
        <strong>{s.methodTitle}</strong> — {s.method}
      </section>

      <div className="confirm-actions">
        <button className="btn btn-primary" onClick={onClose}>
          {s.done}
        </button>
      </div>
    </Dialog>
  );
}
