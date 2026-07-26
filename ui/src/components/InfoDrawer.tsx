import { useId, useRef } from "react";
import { useFocusTrap } from "../lib/useFocusTrap";
import { strings } from "../strings";

interface InfoDrawerProps {
  onClose: () => void;
  onShowIntro?: () => void;
}

// Slide-over "About" panel: how the sim compares to the real exam,
// non-affiliation disclaimer, and license attribution. Available from
// every screen. The "How this exam works" entry appears wherever the
// host screen can render the intro card — which, unlike the spotlight
// tour it replaced, is every screen, because the card describes the exam
// layout rather than pointing at a live one.
export function InfoDrawer({ onClose, onShowIntro }: InfoDrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, onClose);

  const s = strings.info;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div
        ref={ref}
        className="info-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <h2 id={titleId}>{s.title}</h2>
          <button className="btn drawer-close" onClick={onClose} aria-label={s.close}>
            ×
          </button>
        </div>

        <section>
          <h3>{s.compareTitle}</h3>
          <div className="compare-table-scroll">
            <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">{s.compareAspect}</th>
                <th scope="col">{s.compareHere}</th>
                <th scope="col">{s.compareReal}</th>
              </tr>
            </thead>
            <tbody>
              {s.compareRows.map((row) => (
                <tr key={row[0]}>
                  <th scope="row">{row[0]}</th>
                  <td>{row[1]}</td>
                  <td>{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="drawer-note">{s.compareNote}</p>
        </section>

        <section>
          <h3>{s.disclaimerTitle}</h3>
          <p>{s.disclaimerBody}</p>
        </section>

        <section>
          <h3>{s.licensesTitle}</h3>
          <ul className="license-list">
            {s.licenses.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        {onShowIntro && (
          <section>
            <button
              className="btn"
              onClick={() => {
                onShowIntro();
                onClose();
              }}
            >
              {s.howItWorks}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
