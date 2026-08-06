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

  barExtras?: React.ReactNode;

  extras?: React.ReactNode;
}

const LOW_TIME_THRESHOLD_SECONDS = 5 * 60;

const WARNING_LADDER: { fraction: number; kind: "info" | "warning" }[] = [
  { fraction: 0.25, kind: "info" },
  { fraction: 0.125, kind: "warning" },
  { fraction: 1 / 24, kind: "warning" },
];

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

  const startedMs = session.startedAt ? Date.parse(session.startedAt) : NaN;
  const elapsed = Number.isNaN(startedMs) ? 0 : Math.max(0, now - startedMs);

  useEffect(() => {
    if (untimed) return;
    for (const rung of WARNING_LADDER) {
      const at = Math.round(session.durationSeconds * rung.fraction);

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
