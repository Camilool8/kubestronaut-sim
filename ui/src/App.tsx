import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBoot,
  getControlStatus,
  getExam,
  getSession,
  isEnvironmentStarting,
  pollSession,
  startControlReset,
  startControlSwitch,
  type BanksResponse,
  type BootStatus,
  type ControlActionResponse,
  type ControlStatus,
  type ExamInfo,
  type SessionSnapshot,
} from "./api";
import { BootProgress } from "./screens/BootProgress";
import { Exams } from "./screens/Exams";
import { Mode } from "./screens/Mode";
import { Exam, ExamGateControls } from "./screens/Exam";
import { McqExam } from "./screens/McqExam";
import { Progress } from "./screens/Progress";
import { Score } from "./screens/Score";
import { DesktopRequired, gateOverridden, useDesktopGate } from "./components/DesktopRequired";
import { AppHeader, type AppHeaderProps } from "./components/AppHeader";
import { BackgroundJobChip } from "./components/BackgroundJobChip";
import { ControlProgress } from "./components/ControlProgress";
import { ToastLayer } from "./components/Toast";
import { TopProgress } from "./components/TopProgress";
import { ScreenTransition } from "./components/ScreenTransition";
import { toastStore } from "./components/toastStore";
import { HostedBooting } from "./screens/HostedBooting";
import { HostedSignIn } from "./screens/HostedSignIn";
import { HostedStart } from "./screens/HostedStart";
import { Review } from "./screens/Review";
import { SessionChip } from "./components/SessionChip";
import { useHosted } from "./lib/useHosted";
import type { Me } from "./api";
import { useRoute } from "./lib/useHashRoute";
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

// Session-poll cadence while an attempt is being prepared. Fast, because
// the clock starts the instant preparation lands and the candidate is
// looking at a progress overlay with an exam behind it.
const PREPARE_POLL_MS = 1_000;

// The visible screen is a function of session.state FIRST and the URL
// fragment second. session.state stays the outer switch — it is server
// truth, and no bookmark may contradict it — and the route only chooses
// between the views that exist within one state. Today that is `idle`
// alone: the exam selector and the mode screen are two steps before a
// session exists, and a reload in the middle of them should not lose
// its place.
//
// App owns the single session poller (10s interval + window focus) and
// the poll timestamp that Exam/TimerBar anchor their 1Hz local tick to,
// so every screen transition and every timer resync flows from one
// source of truth. It also owns the control-job overlay, which must
// survive the screen transitions a reset/switch causes.
/** Who the candidate is, and how to re-ask. Absent in the local product. */
export interface Hosted {
  me: Me;
  refresh: () => void;
}

/**
 * The gate above everything.
 *
 * One request on load decides which product this is. It has to be a
 * gate rather than a branch inside the app because the app below assumes
 * an environment exists: its session poller, its boot poller and its
 * control poller all address a facilitator, and in hosted mode there is
 * no facilitator to address until a Pod has been built. Mounting them
 * against a hub with no session would be three pollers 404ing in a loop
 * behind a screen that cannot be right anyway.
 *
 * `local` renders SimApp with no props at all, which is the property
 * that matters most here: `./sim up` is byte-identical, and the only
 * trace of any of this in it is one 404 for /api/me at page load.
 */
export default function App() {
  const { state, refresh } = useHosted();
  const route = useRoute();

  if (state.status === "unknown") {
    return (
      <>
        <TopProgress />
        <div className="loading-screen" role="status">
          {state.error ? strings.app.cannotReach(state.error) : strings.app.loading}
        </div>
      </>
    );
  }
  if (state.status === "local") {
    return <SimApp />;
  }

  const { me } = state;
  if (!me.authenticated) {
    return <HostedSignIn me={me} />;
  }

  // A ready environment is the ordinary product with a header chip on
  // top. Everything below this line is the same code a local candidate
  // runs, reaching the same facilitator through the hub's proxy.
  if (me.session?.state === "ready") {
    return <SimApp hosted={{ me, refresh }} />;
  }

  return <HostedHome hosted={{ me, refresh }} route={route} />;
}

/**
 * Signed in, with no usable environment: the lobby, the boot screen, and
 * the two pages that do not need a Pod at all.
 *
 * Progress and a past attempt are answered by the hub out of its own
 * store, so they work with no session running — which is the whole
 * argument for hosted history. A candidate can read last week's exam
 * back without spending a seat to do it.
 */
function HostedHome({ hosted, route }: { hosted: Hosted; route: ReturnType<typeof useRoute> }) {
  const { me, refresh } = hosted;
  const reviewId = route.segments[0] === "history" ? (route.segments[1] ?? null) : null;
  const questionId = reviewId ? (route.segments[2] ?? null) : null;
  const onProgress = route.segments[0] === "progress";

  let screen;
  if (reviewId) {
    screen = <Review attemptId={reviewId} questionId={questionId} />;
  } else if (onProgress) {
    screen = <Progress catalogVersion={0} hosted />;
  } else if (me.session) {
    screen = <HostedBooting session={me.session} onChanged={refresh} />;
  } else {
    screen = <HostedStart me={me} onChanged={refresh} />;
  }

  const headerProps: Partial<AppHeaderProps> = reviewId
    ? {
        variant: "back",
        back: { label: strings.review.back, to: "/progress" },
        crumb: strings.review.crumb,
      }
    : {
        crumb: onProgress ? strings.header.crumbProgress : strings.hosted.chipLabel,
        nav: [
          { label: strings.hosted.chipLabel, to: "/", current: !onProgress && !reviewId },
          { label: strings.header.navProgress, to: "/progress", current: onProgress },
        ],
      };

  return (
    <>
      <TopProgress />
      <AppHeader {...headerProps}>
        <SessionChip
          login={me.user?.login ?? ""}
          session={me.session}
          onChanged={refresh}
        />
      </AppHeader>
      <main>
        <ScreenTransition screenKey={reviewId ? `review:${reviewId}` : onProgress ? "progress" : "lobby"}>
          {screen}
        </ScreenTransition>
      </main>
      <ToastLayer />
    </>
  );
}

function SimApp({ hosted }: { hosted?: Hosted } = {}) {
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

  // The view beneath session.state. Read here rather than in the screens
  // so one component decides what is on screen and what the header above
  // it says about that.
  const route = useRoute();

  const gateVerdict = useDesktopGate();
  // A desktop user who merely shrank their window can wave the gate
  // through; a touch-only device cannot, because the capability is
  // genuinely missing.
  const gateBlocked =
    gateVerdict === "blocked" || (gateVerdict === "narrow" && !gateOverridden());

  // The loaded exam. null until /api/exam answers, which every consumer
  // below treats as hands-on — the conservative read (gates apply).
  // Retried on a timer because during a cold boot the facilitator is not
  // listening yet, and an mcq bank's whole point is being usable before
  // the cluster is: the boot-screen bypass below depends on this
  // arriving as soon as the server can answer.
  //
  // The whole response is kept, not just the engine: the mode screen's
  // header names the certification, and reading it from here means a
  // deep link into that screen needs no prior visit to the selector.
  const [exam, setExam] = useState<ExamInfo | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      try {
        const loaded = await getExam();
        if (!stopped) setExam(loaded);
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
  const isMcq = exam?.examType === "mcq";

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
    // Two ways to know this is not a fault, and both are wanted.
    //
    // The hub answers every proxied request with 503 environment_starting
    // while it replaces a session Pod, and a hosted "New attempt" IS a Pod
    // replacement. That is the durable signal: it survives a reload
    // landing mid-rebuild, where nothing in this tab remembers a click.
    //
    // A control job in flight covers the rest — the window between the
    // 202 and /api/me reporting it, and the LOCAL product, where a reset
    // restarts the facilitator in place and the poll fails for exactly
    // the same non-reason. The overlay is already narrating it; a warning
    // toast over the top says the thing the candidate asked for has gone
    // wrong.
    //
    // pollError is set above either way, so the pre-first-session loading
    // screen keeps its message.
    if (isEnvironmentStarting(err) || wasBusy.current) return;
    pollToastId.current = toastStore.push({
      kind: "warning",
      message: strings.app.cannotReach(String(err)),
      dedupeKey: "session-poll",
    });
  }, []);

  useEffect(() => {
    return pollSession(applySession, handlePollError);
  }, [applySession, handlePollError]);

  // While an attempt is being prepared — drawn, cluster still being seeded
  // — the ordinary 10s poll is far too slow: the clock starts the moment
  // seeding lands, and the candidate would sit on the lobby for most of a
  // poll interval with their exam already running behind it.
  //
  // Keyed on `session.preparing` and NOT on the control job going idle.
  // The job settles in the conductor up to a poll before the facilitator
  // starts the session, so a watcher keyed on `busy` fires inside that
  // window, sees `idle`, and flashes the lobby. The server starts the
  // session first and clears `preparing` second, so this can never
  // observe a moment with neither.
  const preparing = session?.preparing !== undefined;
  useEffect(() => {
    if (!preparing) return;
    let stopped = false;
    const timer = window.setInterval(() => {
      getSession()
        .then((next) => {
          if (!stopped) applySession(next);
        })
        .catch(() => {
          // The facilitator restarts itself during some jobs. The next
          // tick picks it up; the overlay is still saying what is going on.
        });
    }, PREPARE_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [preparing, applySession]);

  // A preparation that failed leaves the session idle with the reason
  // attached. Said once, as a toast, rather than rendered into the lobby:
  // the lobby is where the candidate now needs to act, and the reason is
  // about the attempt that did not start.
  const prepareError = session?.prepareError;
  useEffect(() => {
    if (!prepareError) return;
    toastStore.push({
      kind: "warning",
      message: strings.control.prepareFailed(prepareError),
      dedupeKey: "prepare-error",
    });
  }, [prepareError]);

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

  // A provision retries as a switch, because that is what it is on the
  // wire: POST /api/control/switch with a bank, which the conductor
  // labels "provision" only while no exam is active. Falling through to
  // reset here would have offered to rebuild an environment that has
  // never been built — and rebuilt it as nothing, since a reset carries
  // no bank.
  const handleRetry = useCallback(
    (op: string, bank: string) =>
      runControlAction(() =>
        (op === "switch" || op === "provision") && bank
          ? startControlSwitch(bank)
          : startControlReset(),
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
  //
  // "idle" is exempt for the opposite reason to all of the above. It does
  // not mean "not ready yet", it means "nobody has said what to build" —
  // there is no cluster coming, no progress to narrate, and nothing to
  // wait for. Showing a progress screen there would ask the candidate to
  // wait for an event that only THEY can cause. The selector renders
  // instead, which is where the exam gets chosen.
  const booting =
    boot !== null &&
    boot.state !== "ready" &&
    boot.state !== "idle" &&
    !isMcq &&
    session?.state !== "running" &&
    !showOverlay &&
    !backgroundedJob;

  // The one route with a parameter. `#/exams/<id>/mode` names the bank
  // its cards would start, which need not be the loaded one — a stale
  // bookmark, or a switch that failed — so the id travels to the screen
  // and the screen checks it against the exam the server actually has.
  const modeBankId =
    route.segments[0] === "exams" && route.segments[2] === "mode" ? route.segments[1] : null;

  // The dashboard. Only meaningful while idle: session.state is the outer
  // switch, so asking for it mid-attempt or on the results screen would
  // render the exam or the score anyway — and a nav link that lands you
  // somewhere else is worse than one that is not there.
  const onProgress = route.segments[0] === "progress";
  const idle = session?.state === "idle";

  // Two destinations, and the dashboard is otherwise reachable from
  // nowhere. Only offered where both of them work.
  const nav = idle
    ? [
        { label: strings.header.navExams, to: "/exams", current: !onProgress },
        { label: strings.header.navProgress, to: "/progress", current: onProgress },
      ]
    : undefined;

  // What the header calls the current location. Derived from the same
  // state and route the screen switch below is derived from, so the
  // crumb and the page under it can never name two different things.
  //
  // The mode screen is the one screen reached FROM another, so it takes
  // the back variant. Its crumb waits on /api/exam rather than blocking
  // the header on it: the way out must be there from the first frame.
  const headerProps: Partial<AppHeaderProps> =
    idle && modeBankId
      ? {
          variant: "back",
          back: { label: strings.header.backToExams, to: "/exams" },
          crumb: exam?.certification || exam?.title,
          detail: exam?.certification
            ? strings.exams.certNames[exam.certification]
            : undefined,
          nav,
        }
      : {
          crumb:
            session?.state === "ended"
              ? strings.header.crumbResults
              : idle && onProgress
                ? strings.header.crumbProgress
                : strings.header.crumbLobby,
          nav,
        };

  // A page about the candidate's RECORD rather than their environment.
  // Above the session switch for the same reason the boot screen is: it
  // is not a fourth session state, it is a different subject. Hosted
  // only, and never over a running attempt — session.state is server
  // truth and no bookmark may talk a candidate out of an exam that is
  // counting down.
  const reviewId =
    hosted && route.segments[0] === "history" && session?.state !== "running"
      ? (route.segments[1] ?? null)
      : null;

  let screen = null;
  if (reviewId) {
    screen = <Review attemptId={reviewId} questionId={route.segments[2] ?? null} />;
  } else if (booting) {
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
        screen = onProgress ? (
          <Progress catalogVersion={catalogVersion} hosted={hosted !== undefined} />
        ) : modeBankId ? (
          <Mode
            bankId={modeBankId}
            catalogVersion={catalogVersion}
            onSessionChange={applySession}
          />
        ) : (
          <Exams
            onControlStart={runControlAction}
            catalogVersion={catalogVersion}
            seatKind={hosted?.me.session?.kind}
            seatBank={hosted?.me.session?.bank}
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
        <AppHeader {...headerProps}>
          {/* Hosted only. It carries the lease countdown, which is the one
              thing about a hosted session a candidate cannot be left to
              guess: the seat is taken back at the cap whatever they are
              doing. Deliberately NOT rendered over a running exam — that
              screen has its own topbar with its own clock, and a second
              countdown beside it would be read as the exam's. One good
              consequence and one recorded cost: there is no way to
              destroy an environment mid-attempt by misclick, and a lease
              that expires mid-attempt gives no warning. See
              docs/follow-ups.md. */}
          {hosted && (
            <SessionChip
              login={hosted.me.user?.login ?? ""}
              session={hosted.me.session}
              onChanged={hosted.refresh}
            />
          )}
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
        {/* Keyed on the VIEW, not just the session state: the exam
            selector and the mode screen are both `idle`, and without the
            route in the key the transition would not run between them. */}
        <ScreenTransition
          screenKey={
            booting
              ? "booting"
              : `${session?.state ?? "loading"}${
                  onProgress ? ":progress" : modeBankId ? ":mode" : ""
                }`
          }
        >
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
