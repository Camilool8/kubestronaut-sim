import { useEffect, useState } from "react";
import type { SessionSnapshot } from "../api";
import { formatClock } from "../lib/format";
import { strings } from "../strings";

interface TimerBarProps {
  session: SessionSnapshot;
  fetchedAt: number;
  title: string;
  onEndClick: () => void;
}

const LOW_TIME_THRESHOLD_SECONDS = 5 * 60;

// TimerBar ticks a local clock at 1Hz purely to trigger re-renders; the
// displayed remaining time is always recomputed from
// (session.remainingSeconds, fetchedAt, now) rather than decremented in
// place, so it never drifts and resyncs automatically the moment a new
// poll updates session/fetchedAt.
export function TimerBar({ session, fetchedAt, title, onEndClick }: TimerBarProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsedSincePoll = Math.floor((now - fetchedAt) / 1000);
  const remaining = Math.max(0, session.remainingSeconds - elapsedSincePoll);
  const isLow = remaining < LOW_TIME_THRESHOLD_SECONDS;

  return (
    <div className="topbar">
      <div className="topbar-title">{title}</div>
      <div className={`timer${isLow ? " timer-low" : ""}`}>{formatClock(remaining)}</div>
      <button className="btn btn-danger" onClick={onEndClick}>
        {strings.exam.endExam}
      </button>
    </div>
  );
}
