import { useCallback, useEffect, useRef, useState } from "react";
import {
  getControlStatus,
  getSession,
  pollSession,
  startControlReset,
  type ControlStatus,
  type SessionSnapshot,
} from "./api";
import { Start } from "./screens/Start";
import { Exam } from "./screens/Exam";
import { Score } from "./screens/Score";
import { ControlProgress } from "./components/ControlProgress";
import { strings } from "./strings";

// Control-status poll cadence: fast while a job is running (the overlay
// is live progress), slow when idle (just discovering externally
// triggered jobs, e.g. ./sim reset from a terminal).
const CONTROL_POLL_BUSY_MS = 2_000;
const CONTROL_POLL_IDLE_MS = 15_000;

// The visible screen is a pure function of session.state — no router.
// App owns the single session poller (10s interval + window focus) and
// the poll timestamp that Exam/TimerBar anchor their 1Hz local tick to,
// so every screen transition and every timer resync flows from one
// source of truth. It also owns the control-job overlay, which must
// survive the screen transitions a reset/switch causes.
export default function App() {
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number>(() => Date.now());
  const [pollError, setPollError] = useState<string | null>(null);
  const [control, setControl] = useState<ControlStatus | null>(null);
  const [dismissedJobId, setDismissedJobId] = useState<string | null>(null);
  const wasBusy = useRef(false);

  const applySession = useCallback((next: SessionSnapshot) => {
    setSession(next);
    setFetchedAt(Date.now());
    setPollError(null);
  }, []);

  useEffect(() => {
    return pollSession(applySession, (err) => setPollError(String(err)));
  }, [applySession]);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      let next: ControlStatus | null = null;
      try {
        next = await getControlStatus();
      } catch {
        // The facilitator restarts itself mid-switch; a failed poll while
        // a job may be running just means "keep watching closely".
      }
      if (stopped) return;
      if (next) {
        setControl(next);
        // The moment a job finishes, refetch the session so the screen
        // flips (e.g. to Start after a reset) without waiting out the
        // 10s session poll.
        if (wasBusy.current && !next.busy) {
          getSession().then(applySession).catch(() => {});
        }
        wasBusy.current = next.busy;
      }
      const busyish = next ? next.busy : wasBusy.current;
      timer = window.setTimeout(tick, busyish ? CONTROL_POLL_BUSY_MS : CONTROL_POLL_IDLE_MS);
    };
    tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [applySession]);

  const handleNewAttempt = useCallback(async () => {
    const result = await startControlReset();
    if (result.ok) {
      setDismissedJobId(null);
      setControl({ busy: true, job: result.job });
      wasBusy.current = true;
    } else {
      // Most likely 409 busy — surface whatever the conductor reports
      // on the next poll; nothing else to do here.
      const current = await getControlStatus().catch(() => null);
      if (current) setControl(current);
    }
  }, []);

  const overlayJob =
    control?.busy && control.job
      ? control.job
      : control?.lastJob?.error && control.lastJob.id !== dismissedJobId
        ? control.lastJob
        : null;

  if (!session) {
    return (
      <div className="loading-screen">
        {pollError ? strings.app.cannotReach(pollError) : strings.app.loading}
      </div>
    );
  }

  let screen = null;
  switch (session.state) {
    case "idle":
      screen = <Start onSessionChange={applySession} />;
      break;
    case "running":
      screen = (
        <Exam session={session} fetchedAt={fetchedAt} onSessionChange={applySession} />
      );
      break;
    case "ended":
      screen = <Score onNewAttempt={handleNewAttempt} />;
      break;
  }

  return (
    <>
      {screen}
      {overlayJob && (
        <ControlProgress
          job={overlayJob}
          onRetry={handleNewAttempt}
          onDismiss={() => setDismissedJobId(overlayJob.id)}
        />
      )}
    </>
  );
}
