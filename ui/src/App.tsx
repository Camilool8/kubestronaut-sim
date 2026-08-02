import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBoot,
  getControlStatus,
  getExam,
  getSession,
  pollSession,
  startControlReset,
  startControlSwitch,
  type BanksResponse,
  type BootStatus,
  type ControlActionResponse,
  type ControlStatus,
  type ExamType,
  type SessionSnapshot,
} from "./api";
import { BootProgress } from "./screens/BootProgress";
import { Start } from "./screens/Start";
import { Exam, ExamGateControls } from "./screens/Exam";
import { McqExam } from "./screens/McqExam";
import { Score } from "./screens/Score";
import { DesktopRequired, gateOverridden, useDesktopGate } from "./components/DesktopRequired";
import { AppHeader } from "./components/AppHeader";
import { BackgroundJobChip } from "./components/BackgroundJobChip";
import { ControlProgress } from "./components/ControlProgress";
import { ToastLayer } from "./components/Toast";
import { TopProgress } from "./components/TopProgress";
import { ScreenTransition } from "./components/ScreenTransition";
import { toastStore } from "./components/toastStore";
import { strings } from "./strings";

// Control-status poll cadence: fast while a job is running (the overlay
// is live progress), slow when idle (just discovering externally
// triggered jobs, e.g. ./sim reset from a terminal).
const CONTROL_POLL_BUSY_MS = 2_000;
const CONTROL_POLL_IDLE_MS = 15_000;

// Boot-progress poll cadence. Only runs while the environment is still
// building — once it is ready the effect stops entirely, because the only
// thing that can un-ready it is a control job, and that has its own
// poller and its own overlay.
const BOOT_POLL_MS = 2_000;

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
  // null until the first /api/boot answers. The facilitator now starts
  // before the cluster exists, so this is what the UI has to show during
  // a cold first boot — the window in which it used to show nothing.
  const [boot, setBoot] = useState<BootStatus | null>(null);
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
  // Whether a session has ever arrived, and the id of the toast standing
  // in for `pollError` once one has. Refs, not state: the poll callbacks
  // are created once (they are the effect's deps) and must not re-arm the
  // poller every time either value changes.
  const seenSession = useRef(false);
  const pollToastId = useRef<number | null>(null);

  const gateVerdict = useDesktopGate();
  // A desktop user who merely shrank their window can wave the gate
  // through; a touch-only device cannot, because the capability is
  // genuinely missing.
  const gateBlocked =
    gateVerdict === "blocked" || (gateVerdict === "narrow" && !gateOverridden());

  // Which engine the active bank runs on. null until /api/exam answers,
  // which every consumer below treats as hands-on — the conservative
  // read (gates apply). Retried on a timer because during a cold boot
  // the facilitator is not listening yet, and an mcq bank's whole point
  // is being usable before the cluster is: the boot-screen bypass below
  // depends on this value arriving as soon as the server can answer.
  const [examType, setExamType] = useState<ExamType | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      try {
        const exam = await getExam();
        if (!stopped) setExamType(exam.examType ?? "hands-on");
      } catch {
        if (!stopped) timer = window.setTimeout(tick, 3000);
      }
    };
    tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [catalogVersion]);
  const isMcq = examType === "mcq";

  const applySession = useCallback((next: SessionSnapshot) => {
    seenSession.current = true;
    setSession(next);
    setFetchedAt(Date.now());
    setPollError(null);
    // The facilitator answered again: take the warning back rather than
    // leaving a stale "cannot reach" toast on a working app.
    if (pollToastId.current !== null) {
      toastStore.dismiss(pollToastId.current);
      pollToastId.current = null;
    }
  }, []);

  // `pollError` is rendered by the pre-first-session loading screen below.
  // Every later failure — i.e. all of them, in normal use — used to be
  // written to that state and never read again, so the app's most central
  // fetch failed in silence. After the first success the toast is the
  // signal, and applySession above withdraws it when the poll recovers.
  const handlePollError = useCallback((err: unknown) => {
    setPollError(String(err));
    if (!seenSession.current) return;
    pollToastId.current = toastStore.push({
      kind: "warning",
      message: strings.app.cannotReach(String(err)),
      dedupeKey: "session-poll",
    });
  }, []);

  useEffect(() => {
    return pollSession(applySession, handlePollError);
  }, [applySession, handlePollError]);

  // Boot progress. Stops the moment the environment reports ready — a
  // ready environment can only go back to building via a control job,
  // which owns its own polling and its own overlay.
  useEffect(() => {
    if (boot?.state === "ready") return;
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      try {
        const next = await getBoot();
        if (stopped) return;
        setBoot(next);
        if (next.state === "ready") return; // effect re-runs and returns early
      } catch {
        // Expected for the first seconds of a cold start, before the
        // facilitator is listening at all. Keep asking quietly; the
        // screen already says it is waiting on the services.
      }
      if (!stopped) timer = window.setTimeout(tick, BOOT_POLL_MS);
    };
    tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [boot?.state]);

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
      // Most likely 409 busy or 502 (conductor down). Either way the user
      // pressed a button and must be told why nothing is happening.
      toastStore.push({
        kind: "warning",
        message: strings.control.actionFailed(result.error),
        dedupeKey: "control-action",
      });
      const current = await getControlStatus().catch(() => null);
      if (current) setControl(current);
    }
  }, []);

  const handleBanksLoaded = useCallback((banks: BanksResponse) => {
    setBankTitles(Object.fromEntries(banks.banks.map((b) => [b.id, b.title])));
  }, []);

  const runControlAction = useCallback(
    async (start: () => Promise<ControlActionResponse>) => {
      try {
        applyControlResult(await start());
      } catch (err) {
        // fetch itself rejected (facilitator unreachable, network down).
        toastStore.push({
          kind: "warning",
          message: strings.control.actionFailed(String(err)),
          dedupeKey: "control-action",
        });
      }
    },
    [applyControlResult],
  );

  const handleNewAttempt = useCallback(
    () => runControlAction(startControlReset),
    [runControlAction],
  );

  const handleRetry = useCallback(
    (op: string, bank: string) =>
      runControlAction(() =>
        op === "switch" && bank ? startControlSwitch(bank) : startControlReset(),
      ),
    [runControlAction],
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

  // Still running, just not on top of the screen. It gets an ambient chip
  // instead of nothing at all.
  const backgroundedJob =
    control?.busy && control.job && control.job.id === backgroundedJobId ? control.job : null;

  // The boot screen is a gate ABOVE the session switch, not a fourth
  // session state — session.state stays a pure three-way and the switch
  // below is untouched.
  //
  // Two exclusions carry real weight:
  //
  //  - a running attempt always wins. `down` + `up` mid-exam resumes into
  //    the exam; the server-side timer never stopped, so replacing it
  //    with a progress screen would hide a clock that is still counting.
  //  - a control job always wins. Every reset runs the same bootstrap and
  //    removes /shared/ready on the way in, so boot state legitimately
  //    reverts to "building" for the whole of one — and ControlProgress
  //    is already reporting it, in more detail. Without this the two
  //    would fight over the same information.
  // An mcq bank is exempt: it needs nothing the boot screen is waiting
  // for (the facilitator answering IS its readiness), and the server's
  // start gate is bypassed for mcq to match. The cluster keeps building
  // silently behind the lobby so switching back to a hands-on bank
  // stays seamless.
  const booting =
    boot !== null &&
    boot.state !== "ready" &&
    !isMcq &&
    session?.state !== "running" &&
    !showOverlay &&
    !backgroundedJob;

  // What the header calls the current location. Derived from the same
  // session.state the screen switch below is derived from, so the crumb
  // and the page under it can never name two different things.
  const headerCrumb =
    session?.state === "ended" ? strings.header.crumbResults : strings.header.crumbLobby;

  let screen = null;
  if (booting) {
    screen = <BootProgress boot={boot} onRetry={handleNewAttempt} />;
  } else if (!session) {
    screen = (
      <div className="loading-screen" role="status">
        {pollError ? strings.app.cannotReach(pollError) : strings.app.loading}
      </div>
    );
  } else {
    switch (session.state) {
      case "idle":
        screen = (
          <Start
            onSessionChange={applySession}
            onControlStart={runControlAction}
            catalogVersion={catalogVersion}
            onBanksLoaded={handleBanksLoaded}
          />
        );
        break;
      case "running":
        // A multiple-choice exam is the one exam type that genuinely
        // works on a phone — no terminal, no remote desktop — so the
        // desktop gate never applies to it.
        if (isMcq) {
          screen = (
            <McqExam session={session} fetchedAt={fetchedAt} onSessionChange={applySession} />
          );
          break;
        }
        // The hands-on exam is a terminal beside a remote desktop; on a
        // phone there is no layout that works. The lobby and score screens
        // stay usable, and a running session still shows its countdown and
        // an End exam control here — the server-side timer keeps going
        // regardless, so nobody may be stranded without a way to submit.
        screen = gateBlocked ? (
          <DesktopRequired verdict={gateVerdict}>
            <ExamGateControls
              session={session}
              fetchedAt={fetchedAt}
              onSessionChange={applySession}
            />
          </DesktopRequired>
        ) : (
          <Exam session={session} fetchedAt={fetchedAt} onSessionChange={applySession} />
        );
        break;
      case "ended":
        screen = <Score
            onNewAttempt={handleNewAttempt}
            endReason={session.endReason}
            mode={session.mode}
          />;
        break;
    }
  }

  return (
    <>
      <TopProgress />
      {/* The header is chrome for the screens that are a PAGE. The exam is
          not one — it has its own topbar carrying a clock and a submit
          button — and neither is the boot screen, which is a takeover with
          nothing to navigate to yet. */}
      {session && !booting && session.state !== "running" && (
        <AppHeader crumb={headerCrumb}>
          {/* A backgrounded rebuild used to run for 2-4 minutes with no
              indicator anywhere: the lobby behind it looked idle while the
              cluster it describes was being torn down. */}
          {backgroundedJob && (
            <BackgroundJobChip
              job={backgroundedJob}
              bankTitle={bankTitles[backgroundedJob.bank]}
              onReopen={() => setBackgroundedJobId(null)}
            />
          )}
        </AppHeader>
      )}
      <main>
        <ScreenTransition screenKey={booting ? "booting" : (session?.state ?? "loading")}>
          {screen}
        </ScreenTransition>
      </main>
      <ToastLayer />
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
