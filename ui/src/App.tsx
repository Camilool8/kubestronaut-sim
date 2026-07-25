import { useCallback, useEffect, useRef, useState } from "react";
import {
  getControlStatus,
  getSession,
  pollSession,
  startControlReset,
  startControlSwitch,
  type BanksResponse,
  type ControlActionResponse,
  type ControlStatus,
  type SessionSnapshot,
} from "./api";
import { Start } from "./screens/Start";
import { Exam } from "./screens/Exam";
import { Score } from "./screens/Score";
import { ControlProgress } from "./components/ControlProgress";
import { ThemeToggle } from "./components/ThemeToggle";
import { InfoButton } from "./components/InfoButton";
import { ToastLayer } from "./components/Toast";
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
  const [backgroundedJobId, setBackgroundedJobId] = useState<string | null>(null);
  // Bank id -> catalog title, so the overlay can name the exam a switch
  // is heading to instead of showing its slug.
  const [bankTitles, setBankTitles] = useState<Record<string, string>>({});
  // Incremented whenever a control job finishes so the Start screen
  // refetches the exam summary and bank catalog — a completed switch
  // changes both while Start stays mounted on the idle screen.
  const [catalogVersion, setCatalogVersion] = useState(0);
  // Incremented whenever a job is accepted, to restart the control-poll
  // effect. Without it the poll timer armed at the idle cadence (15s)
  // keeps running, and since the job returned by POST has every phase
  // still "pending", the checklist sits visibly frozen until that timer
  // finally fires. Restarting the effect polls again immediately.
  const [jobNonce, setJobNonce] = useState(0);
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
          setCatalogVersion((v) => v + 1);
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
  }, [applySession, jobNonce]);

  // Shared entry point for every control action's outcome (reset from
  // Score, switch from the Lobby, retry from the overlay): an accepted
  // job flips the overlay on immediately instead of waiting a poll.
  const applyControlResult = useCallback(async (result: ControlActionResponse) => {
    if (result.ok) {
      setDismissedJobId(null);
      setBackgroundedJobId(null);
      setControl({ busy: true, job: result.job });
      wasBusy.current = true;
      // Tear down the idle-cadence timer and poll again now — the job
      // we just optimistically rendered has no phase running yet.
      setJobNonce((n) => n + 1);
    } else {
      // Most likely 409 busy — surface whatever the conductor reports.
      const current = await getControlStatus().catch(() => null);
      if (current) setControl(current);
    }
  }, []);

  const handleBanksLoaded = useCallback((banks: BanksResponse) => {
    setBankTitles(Object.fromEntries(banks.banks.map((b) => [b.id, b.title])));
  }, []);

  const handleNewAttempt = useCallback(async () => {
    applyControlResult(await startControlReset());
  }, [applyControlResult]);

  const handleRetry = useCallback(
    async (op: string, bank: string) => {
      if (op === "switch" && bank) {
        applyControlResult(await startControlSwitch(bank));
      } else {
        applyControlResult(await startControlReset());
      }
    },
    [applyControlResult],
  );

  const overlayJob =
    control?.busy && control.job
      ? control.job
      : control?.lastJob?.error && control.lastJob.id !== dismissedJobId
        ? control.lastJob
        : null;

  // A backgrounded job stays running; only the overlay is hidden, and a
  // new job (or a failure) brings it back.
  const showOverlay = overlayJob !== null && overlayJob.id !== backgroundedJobId;

  if (!session) {
    return (
      <main>
        <div className="loading-screen" role="status">
          {pollError ? strings.app.cannotReach(pollError) : strings.app.loading}
        </div>
      </main>
    );
  }

  let screen = null;
  switch (session.state) {
    case "idle":
      screen = (
        <Start
          onSessionChange={applySession}
          onControlStart={applyControlResult}
          catalogVersion={catalogVersion}
          onBanksLoaded={handleBanksLoaded}
        />
      );
      break;
    case "running":
      screen = (
        <Exam session={session} fetchedAt={fetchedAt} onSessionChange={applySession} />
      );
      break;
    case "ended":
      screen = <Score onNewAttempt={handleNewAttempt} endReason={session.endReason} />;
      break;
  }

  return (
    <>
      <main>{screen}</main>
      <ToastLayer />
      {session.state !== "running" && (
        <>
          <ThemeToggle floating />
          <InfoButton floating />
        </>
      )}
      {showOverlay && overlayJob && (
        <ControlProgress
          job={overlayJob}
          bankTitle={bankTitles[overlayJob.bank]}
          onRetry={() => handleRetry(overlayJob.op, overlayJob.bank)}
          onDismiss={() => setDismissedJobId(overlayJob.id)}
          onBackground={() => setBackgroundedJobId(overlayJob.id)}
        />
      )}
    </>
  );
}
