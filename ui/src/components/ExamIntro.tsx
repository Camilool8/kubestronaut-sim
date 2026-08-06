import { formatClock } from "../lib/format";
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

export function ExamIntro({
  onClose,
  durationSeconds,
}: {
  onClose: () => void;
  durationSeconds?: number;
}) {
  const s = strings.intro;

  const timer =
    durationSeconds && durationSeconds > 2
      ? formatClock(durationSeconds - 2)
      : s.diagramTimerLabel;

  return (
    <Dialog title={s.title} onClose={onClose} wide>
      <div className="intro-schematic" role="img" aria-label={s.schematicAlt}>
        <div className="intro-topbar">
          <span className="intro-region-label">3</span>
          <span className="intro-chip intro-chip-timer">{timer}</span>
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
