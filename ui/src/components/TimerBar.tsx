import { useEffect, useRef, useState } from "react";
import type { SessionSnapshot } from "../api";
import { formatClock, formatClockSpoken, formatElapsed } from "../lib/format";
import { strings } from "../strings";
import { ThemeToggle } from "./ThemeToggle";
import { toastStore } from "./toastStore";

interface TimerBarProps {
  session: SessionSnapshot;
  fetchedAt: number;
  title: string;
  onEndClick: () => void;
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

// TimerBar ticks a local clock at 1Hz purely to trigger re-renders; the
// displayed remaining time is always recomputed from
// (session.remainingSeconds, fetchedAt, now) rather than decremented in
// place, so it never drifts and resyncs automatically the moment a new
// poll updates session/fetchedAt.
export function TimerBar({ session, fetchedAt, title, onEndClick, extras }: TimerBarProps) {
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
    <header className="topbar">
      <h1 className="topbar-title">{title}</h1>
      {extras}
      <ThemeToggle />
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
      <button id="end-exam-button" className="btn btn-danger" onClick={onEndClick}>
        {strings.exam.endExam}
      </button>
    </header>
  );
}
