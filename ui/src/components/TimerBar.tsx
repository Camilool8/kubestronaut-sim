import { useEffect, useRef, useState } from "react";
import type { SessionSnapshot } from "../api";
import { formatClock, formatClockSpoken, formatElapsed } from "../lib/format";
import { NavBar } from "./NavBar";
import { NavMenuItem, NavMenuSection } from "./NavMenu";
import { strings } from "../strings";
import { toastStore } from "./toastStore";

interface TimerBarProps {
  session: SessionSnapshot;
  fetchedAt: number;
  title: string;
  onEndClick: () => void;
  /**
   * Controls that stay in the BAR.
   *
   * The hands-on engine's clipboard bridge and keymap toggle live here:
   * they are reached repeatedly while working, they are icon-sized, and
   * that engine never renders below 768px anyway — the device gate
   * refuses it. Burying a tool you use every few minutes behind a tap
   * would be consistency bought at the cost of the thing consistency is
   * for.
   */
  barExtras?: React.ReactNode;
  /** Extra rows in the menu's attempt section. */
  extras?: React.ReactNode;
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

/**
 * The exam's bar: the same navbar, carrying what an exam has instead of
 * what a page has.
 *
 * It used to be a separate `<header className="topbar">` with its own
 * wrapping flex row, its own theme toggle and its own About button — a
 * bar that looked related to the app header and shared nothing with it,
 * so the two drifted and neither could be predicted from the other.
 *
 * Now it is `NavBar` with three substitutions, and every one of them is
 * a fact about an exam rather than a style choice:
 *
 *  - the brand does not link home, because `session.state` is the outer
 *    switch and going home mid-attempt renders the exam again;
 *  - the trail names the exam instead of a route, because there is no
 *    route to name;
 *  - the navigation section is absent and an attempt section takes its
 *    place, because there is nowhere to go and one thing to do.
 *
 * The clock rides the ambient slot — the same slot that carries the
 * hosted lease countdown, for the same reason: it is the number that
 * must never be behind a tap.
 *
 * TimerBar still ticks a local clock at 1Hz purely to trigger re-renders;
 * the displayed remaining time is always recomputed from
 * (session.remainingSeconds, fetchedAt, now) rather than decremented in
 * place, so it never drifts and resyncs the moment a new poll lands.
 */
export function TimerBar({
  session,
  fetchedAt,
  title,
  onEndClick,
  barExtras,
  extras,
}: TimerBarProps) {
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef<Set<number>>(new Set());

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

  return (
    <NavBar
      home={false}
      trail={[{ label: title }]}
      menuExtra={
        <NavMenuSection label={strings.header.menuExam}>
          {extras}
          <NavMenuItem
            icon="send"
            label={strings.exam.endAttempt(session.mode)}
            onSelect={onEndClick}
            danger
          />
        </NavMenuSection>
      }
    >
      {barExtras}
      {session.mode && session.mode !== "exam" && (
        <span className="mode-chip">{strings.modes[session.mode].label}</span>
      )}
      <div className={`timer${isLow ? " timer-low" : ""}`} role="timer">
        {untimed ? (
          <>
            <span aria-hidden="true">{formatElapsed(elapsed)}</span>
            <span className="sr-only">{strings.exam.timeElapsed(formatElapsed(elapsed))}</span>
          </>
        ) : (
          <>
            <span aria-hidden="true">{formatClock(remaining)}</span>
            <span className="sr-only">
              {strings.exam.timeRemaining(formatClockSpoken(remaining))}
            </span>
          </>
        )}
      </div>
    </NavBar>
  );
}
