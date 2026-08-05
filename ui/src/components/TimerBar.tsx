import { useEffect, useRef, useState } from "react";
import type { SessionSnapshot } from "../api";
import { formatClock, formatClockSpoken, formatElapsed } from "../lib/format";
import { MCQ_COMPACT_QUERY, useMediaQuery } from "../lib/useMediaQuery";
import { strings } from "../strings";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";
import { toastStore } from "./toastStore";

interface TimerBarProps {
  session: SessionSnapshot;
  fetchedAt: number;
  title: string;
  onEndClick: () => void;
  extras?: React.ReactNode;
  /**
   * Allow the bar to collapse to a clock and an overflow sheet on a
   * narrow viewport.
   *
   * Opt-in rather than automatic, and only the mcq screen opts in. The
   * hands-on screen at this width is a *desktop* window someone dragged
   * narrow — a touch-only device never reaches it — and two things there
   * depend on the full bar: the skip link out of the VNC canvas targets
   * `#end-exam-button` by id, and that id would only exist while a sheet
   * happened to be open. A keyboard exit from a remote desktop is not
   * something to make conditional on a panel being open.
   */
  compactable?: boolean;
}

const LOW_TIME_THRESHOLD_SECONDS = 5 * 60;

// Escalating time warnings, as FRACTIONS of the attempt's own duration
// rather than fixed minutes. They used to be 30/15/5 absolute, which is
// right for a 120-minute exam and useless for a 60-minute speed run —
// the first two rungs would fire in the opening seconds and the "5
// minutes left" warning would arrive with a twelfth of the attempt gone
// instead of a twenty-fourth.
const WARNING_LADDER: { fraction: number; kind: "info" | "warning" }[] = [
  { fraction: 0.25, kind: "info" },
  { fraction: 0.125, kind: "warning" },
  { fraction: 1 / 24, kind: "warning" },
];

// TimerBar ticks a local clock at 1Hz purely to trigger re-renders; the
// displayed remaining time is always recomputed from
// (session.remainingSeconds, fetchedAt, now) rather than decremented in
// place, so it never drifts and resyncs automatically the moment a new
// poll updates session/fetchedAt.
export function TimerBar({
  session,
  fetchedAt,
  title,
  onEndClick,
  extras,
  compactable = false,
}: TimerBarProps) {
  const [now, setNow] = useState(() => Date.now());
  const [menuOpen, setMenuOpen] = useState(false);
  const firedRef = useRef<Set<number>>(new Set());
  const narrow = useMediaQuery(MCQ_COMPACT_QUERY);
  const compact = compactable && narrow;

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsedSincePoll = Math.floor((now - fetchedAt) / 1000);
  const remaining = Math.max(0, session.remainingSeconds - elapsedSincePoll);
  const untimed = session.untimed;
  const isLow = !untimed && remaining < LOW_TIME_THRESHOLD_SECONDS;

  // Training counts up instead. There is no deadline to count toward, and
  // a frozen 00:00 would read as an attempt that had already run out.
  const startedMs = session.startedAt ? Date.parse(session.startedAt) : NaN;
  const elapsed = Number.isNaN(startedMs) ? 0 : Math.max(0, now - startedMs);

  useEffect(() => {
    if (untimed) return; // nothing to warn about
    for (const rung of WARNING_LADDER) {
      const at = Math.round(session.durationSeconds * rung.fraction);
      // Only fire when the boundary is crossed while running — a session
      // that STARTS below a rung (short mock durations) shouldn't open
      // with a stack of stale warnings for higher rungs.
      if (at > 0 && remaining <= at && remaining > at - 90 && !firedRef.current.has(at)) {
        firedRef.current.add(at);
        toastStore.push({
          kind: rung.kind,
          message: strings.toast.timeWarning(Math.round(at / 60)),
          dedupeKey: "time-warning",
        });
      }
    }
  }, [remaining, untimed, session.durationSeconds]);

  const clock = untimed ? (
    <>
      <span aria-hidden="true">{formatElapsed(elapsed)}</span>
      <span className="sr-only">{strings.exam.timeElapsed(formatElapsed(elapsed))}</span>
    </>
  ) : (
    <>
      <span aria-hidden="true">{formatClock(remaining)}</span>
      <span className="sr-only">{strings.exam.timeRemaining(formatClockSpoken(remaining))}</span>
    </>
  );

  const modeChip = session.mode && session.mode !== "exam" && (
    <span className="mode-chip">{strings.modes[session.mode].label}</span>
  );

  // Compact: the clock, and one way to everything else.
  //
  // The controls MOVE rather than being rendered twice and hidden — the
  // same rule AppHeader follows, and for the same reason: two copies of
  // one button give it two accessible names, and a screen reader is
  // offered both with no way to tell that only one is on screen.
  //
  // What stays is what a candidate must never have to go looking for
  // while a countdown runs: the time left. Everything else — the exam's
  // title, the answered tally, the theme, the About panel, training's
  // score button and Submit itself — is a thing you decide to do, and a
  // thing you decide to do can cost a tap.
  //
  // Submit costs that tap deliberately. It ends the attempt, it is the
  // one irreversible control on the screen, and on a phone the topbar is
  // exactly where a thumb reaching for the notch lands.
  if (compact) {
    return (
      <>
        <header className="topbar topbar-compact">
          <div className={`timer${isLow ? " timer-low" : ""}`} role="timer">
            {clock}
          </div>
          {modeChip}
          <button
            type="button"
            className="btn topbar-more"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
          >
            <Icon name="menu" />
            <span className="sr-only">{strings.exam.moreLabel}</span>
          </button>
        </header>
        {menuOpen && (
          <Dialog title={title} onClose={() => setMenuOpen(false)} sheet className="topbar-sheet">
            {/* The exam's title is the sheet's heading, so opening this
                is also how a candidate answers "which exam am I in" —
                the question the topbar used to spend a whole flex row
                answering, every second, to someone who already knew. */}
            <div className="topbar-sheet-extras">
              {extras}
              <ThemeToggle />
            </div>
            <button
              id="end-exam-button"
              className="btn btn-danger topbar-sheet-end"
              onClick={() => {
                setMenuOpen(false);
                onEndClick();
              }}
            >
              {strings.exam.endAttempt(session.mode)}
            </button>
          </Dialog>
        )}
      </>
    );
  }

  return (
    <header className="topbar">
      <h1 className="topbar-title">{title}</h1>
      {extras}
      <ThemeToggle />
      {modeChip}
      <div className={`timer${isLow ? " timer-low" : ""}`} role="timer">
        {clock}
      </div>
      <button id="end-exam-button" className="btn btn-danger" onClick={onEndClick}>
        {strings.exam.endAttempt(session.mode)}
      </button>
    </header>
  );
}
