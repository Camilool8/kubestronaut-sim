import { useEffect, useRef } from "react";
import type { SessionSnapshot } from "../api";
import { useExamClock } from "../lib/useExamClock";
import { Icon } from "./Icon";
import { NavBar } from "./NavBar";
import { NavMenuSection } from "./NavMenu";
import { TimerReadout } from "./TimerReadout";
import { HEADER_COMPACT_QUERY, useMediaQuery } from "../lib/useMediaQuery";
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
  const firedRef = useRef<Set<number>>(new Set());
  const compact = useMediaQuery(HEADER_COMPACT_QUERY);

  const { remaining, elapsed, untimed } = useExamClock(session, fetchedAt);
  const isLow = !untimed && remaining < LOW_TIME_THRESHOLD_SECONDS;

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
        extras ? (
          <NavMenuSection label={strings.header.menuExam}>{extras}</NavMenuSection>
        ) : undefined
      }
    >
      {barExtras}
      {session.mode && session.mode !== "exam" && (
        <span className="mode-chip">{strings.modes[session.mode].label}</span>
      )}
      <div className={`timer${isLow ? " timer-low" : ""}`} role="timer">
        <TimerReadout untimed={untimed} remaining={remaining} elapsed={elapsed} />
      </div>
      <button
        type="button"
        className="btn btn-primary navbar-submit"
        onClick={onEndClick}
        // Set unconditionally so the accessible name does not depend on the
        // viewport: at compact widths the visible label is dropped and the
        // icon carries the button alone.
        aria-label={strings.exam.endAttempt(session.mode)}
      >
        <Icon name="send" />
        {!compact && strings.exam.endAttempt(session.mode)}
      </button>
    </NavBar>
  );
}
