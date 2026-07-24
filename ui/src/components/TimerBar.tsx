import { useEffect, useRef, useState } from "react";
import type { SessionSnapshot } from "../api";
import { formatClock } from "../lib/format";
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

// Escalating time warnings: a gentle note at 30 minutes, urgent sticky
// warnings at 15 and 5. Each fires exactly once per mounted exam.
const WARNING_LADDER: { seconds: number; kind: "info" | "warning" }[] = [
  { seconds: 30 * 60, kind: "info" },
  { seconds: 15 * 60, kind: "warning" },
  { seconds: 5 * 60, kind: "warning" },
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
  const isLow = remaining < LOW_TIME_THRESHOLD_SECONDS;

  useEffect(() => {
    for (const rung of WARNING_LADDER) {
      // Only fire when the boundary is crossed while running — a session
      // that STARTS below a rung (short mock durations) shouldn't open
      // with a stack of stale warnings for higher rungs.
      if (
        remaining <= rung.seconds &&
        remaining > rung.seconds - 90 &&
        !firedRef.current.has(rung.seconds)
      ) {
        firedRef.current.add(rung.seconds);
        toastStore.push({
          kind: rung.kind,
          message: strings.toast.timeWarning(Math.round(rung.seconds / 60)),
          dedupeKey: "time-warning",
        });
      }
    }
  }, [remaining]);

  return (
    <header className="topbar">
      <div className="topbar-title">{title}</div>
      {extras}
      <ThemeToggle />
      <div className={`timer${isLow ? " timer-low" : ""}`}>{formatClock(remaining)}</div>
      <button className="btn btn-danger" onClick={onEndClick}>
        {strings.exam.endExam}
      </button>
    </header>
  );
}
