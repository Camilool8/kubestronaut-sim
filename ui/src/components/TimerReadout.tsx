import { formatClock, formatClockSpoken, formatElapsed } from "../lib/format";
import { strings } from "../strings";

interface TimerReadoutProps {
  untimed: boolean;
  remaining: number;
  elapsed: number;
}

// The face of the exam clock, shared by the exam header and the mobile gate.
// The digits are decorative — a screen reader reads the sr-only line instead,
// because "0:08:20" is not something you want spelled out character by
// character every second. Both callers supply their own role="timer" wrapper,
// which is why this renders a bare fragment.
export function TimerReadout({ untimed, remaining, elapsed }: TimerReadoutProps) {
  if (untimed) {
    return (
      <>
        <span aria-hidden="true">{formatElapsed(elapsed)}</span>
        <span className="sr-only">{strings.exam.timeElapsed(formatElapsed(elapsed))}</span>
      </>
    );
  }

  return (
    <>
      <span aria-hidden="true">{formatClock(remaining)}</span>
      <span className="sr-only">{strings.exam.timeRemaining(formatClockSpoken(remaining))}</span>
    </>
  );
}
