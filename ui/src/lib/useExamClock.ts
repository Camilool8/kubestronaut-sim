import type { SessionSnapshot } from "../api";
import { useTick } from "./useTick";

export interface ExamClock {
  // Seconds left, floored at zero.
  remaining: number;

  // Milliseconds since the attempt started, floored at zero.
  elapsed: number;

  untimed: boolean;
}

// The clock is the server's, not the tab's: `remainingSeconds` is whatever the
// last session poll said and the local tick only ages it, so a paused or
// throttled tab cannot invent time. `startedAt` is empty on a session that
// never started, hence the NaN guard rather than a bare Date.parse.
export function useExamClock(session: SessionSnapshot, fetchedAt: number): ExamClock {
  const now = useTick(true);
  const startedMs = session.startedAt ? Date.parse(session.startedAt) : NaN;

  return {
    remaining: Math.max(0, session.remainingSeconds - Math.floor((now - fetchedAt) / 1000)),
    elapsed: Number.isNaN(startedMs) ? 0 : Math.max(0, now - startedMs),
    untimed: session.untimed,
  };
}
