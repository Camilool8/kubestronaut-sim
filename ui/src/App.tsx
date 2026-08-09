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
import { Preparing } from "./screens/Preparing";
import { Exam, ExamGateControls } from "./screens/Exam";
import { McqExam } from "./screens/McqExam";
import { Progress } from "./screens/Progress";
import { Score } from "./screens/Score";
import { DesktopRequired, gateOverridden, useDesktopGate } from "./components/DesktopRequired";
import { NavBar, type Crumb, type NavItem } from "./components/NavBar";
import { NavMenuItem, NavMenuSection } from "./components/NavMenu";
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
import { useHosted } from "./lib/useHosted";
import type { Me } from "./api";
import { navigate, useRoute } from "./lib/useHashRoute";
import { useSeatLanding } from "./lib/useSeatLanding";
import { strings } from "./strings";

const CONTROL_POLL_BUSY_MS = 2_000;
const CONTROL_POLL_IDLE_MS = 15_000;

const BOOT_POLL_MS = 2_000;

const PREPARE_POLL_MS = 1_000;

export interface Hosted {
  me: Me;
  refresh: () => void;
}

export default function App() {
  const { state, refresh } = useHosted();
  const route = useRoute();

  useSeatLanding(state);

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

  if (me.session?.state === "ready") {
    return <SimApp hosted={{ me, refresh }} />;
  }

  return <HostedHome hosted={{ me, refresh }} route={route} />;
}

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

  const nav: NavItem[] = [
    { label: strings.hosted.chipLabel, to: "/", icon: "home", current: !onProgress && !reviewId },
    { label: strings.header.navProgress, to: "/progress", icon: "chart", current: onProgress },
  ];
  const trail: Crumb[] = reviewId
    ? [{ label: strings.header.navProgress, to: "/progress" }, { label: strings.review.crumb }]
    : [{ label: onProgress ? strings.header.crumbProgress : strings.hosted.chipLabel }];

  return (
    <>
      <TopProgress />
      <NavBar
        trail={trail}
        nav={nav}
        session={{ login: me.user?.login ?? "", session: me.session, onChanged: refresh }}
      />
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

  const [boot, setBoot] = useState<BootStatus | null>(null);
  const [dismissedJobId, setDismissedJobId] = useState<string | null>(null);
  const [backgroundedJobId, setBackgroundedJobId] = useState<string | null>(null);

  const [bankTitles, setBankTitles] = useState<Record<string, string>>({});

  const [catalogVersion, setCatalogVersion] = useState(0);

  const [jobNonce, setJobNonce] = useState(0);
  const wasBusy = useRef(false);

  const seenSession = useRef(false);
  const pollToastId = useRef<number | null>(null);

  const route = useRoute();

  const gateVerdict = useDesktopGate();

  const gateBlocked =
    gateVerdict === "blocked" || (gateVerdict === "narrow" && !gateOverridden());

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

    if (pollToastId.current !== null) {
      toastStore.dismiss(pollToastId.current);
      pollToastId.current = null;
    }
  }, []);

  const handlePollError = useCallback((err: unknown) => {
    setPollError(String(err));
    if (!seenSession.current) return;

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

  const preparing = session?.preparing !== undefined;
  useEffect(() => {
    if (!preparing) return;
    let stopped = false;
    const timer = window.setInterval(() => {
      getSession()
        .then((next) => {
          if (!stopped) applySession(next);
        })
        .catch(() => {});
    }, PREPARE_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [preparing, applySession]);

  const prepareError = session?.prepareError;
  useEffect(() => {
    if (!prepareError) return;
    toastStore.push({
      kind: "warning",
      message: strings.control.prepareFailed(prepareError),
      dedupeKey: "prepare-error",
    });
  }, [prepareError]);

  useEffect(() => {
    if (boot?.state === "ready") return;
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      try {
        const next = await getBoot();
        if (stopped) return;
        setBoot(next);
        if (next.state === "ready") return;
      } catch {}
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
      } catch {}
      if (stopped) return;
      if (next) {
        setControl(next);

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

  const applyControlResult = useCallback(async (result: ControlActionResponse) => {
    if (result.ok) {
      setDismissedJobId(null);
      setBackgroundedJobId(null);
      setControl({ busy: true, job: result.job });
      wasBusy.current = true;

      setJobNonce((n) => n + 1);
    } else {
      toastStore.push({
        kind: "warning",
        message: strings.control.actionFailed(result.error),
        dedupeKey: "control-action",
      });
      const current = await getControlStatus().catch(() => null);
      if (current) setControl(current);
    }
  }, []);

  // A prepare is a conductor job we did not start through runControlAction, so
  // nothing has told the control poll to wake up. Left alone it sits out the
  // 15s idle interval before it notices, which is most of the dead air between
  // pressing a mode and seeing what the cluster is doing.
  const handlePreparing = useCallback(() => {
    setDismissedJobId(null);
    setBackgroundedJobId(null);
    wasBusy.current = true;
    setJobNonce((n) => n + 1);
  }, []);

  const handleBanksLoaded = useCallback((banks: BanksResponse) => {
    setBankTitles(Object.fromEntries(banks.banks.map((b) => [b.id, b.title])));
  }, []);

  const runControlAction = useCallback(
    async (start: () => Promise<ControlActionResponse>) => {
      try {
        applyControlResult(await start());
      } catch (err) {
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
        (op === "switch" || op === "provision") && bank
          ? startControlSwitch(bank)
          : startControlReset(),
      ),
    [runControlAction],
  );

  const candidateJob =
    control?.busy && control.job
      ? control.job
      : control?.lastJob?.error && control.lastJob.id !== dismissedJobId
        ? control.lastJob
        : null;

  // The preparing screen is the seed's own view, and a failed seed reaches the
  // candidate as `prepareError`. Overlaying a modal on top of either would be
  // a second telling of the same thing.
  const overlayJob = candidateJob?.op === "seed" ? null : candidateJob;

  const showOverlay = overlayJob !== null && overlayJob.id !== backgroundedJobId;

  const seedDetail =
    control?.busy && control.job?.op === "seed"
      ? control.job.phases.find((p) => p.state === "running")?.detail
      : undefined;

  const backgroundedJob =
    control?.busy && control.job && control.job.id === backgroundedJobId ? control.job : null;

  const booting =
    boot !== null &&
    boot.state !== "ready" &&
    boot.state !== "idle" &&
    !isMcq &&
    session?.state !== "running" &&
    !showOverlay &&
    !backgroundedJob;

  const modeBankId =
    route.segments[0] === "exams" && route.segments[2] === "mode" ? route.segments[1] : null;

  const onProgress = route.segments[0] === "progress";
  const idle = session?.state === "idle";

  const nav: NavItem[] | undefined = idle
    ? [
        { label: strings.header.navExams, to: "/exams", icon: "grid", current: !onProgress },
        { label: strings.header.navProgress, to: "/progress", icon: "chart", current: onProgress },
      ]
    : undefined;

  const trail: Crumb[] =
    idle && modeBankId
      ? [
          { label: strings.header.navExams, to: "/exams" },
          { label: exam?.certification || exam?.title || strings.header.crumbLobby },
        ]
      : [
          {
            label:
              session?.state === "ended"
                ? strings.header.crumbResults
                : idle && onProgress
                  ? strings.header.crumbProgress
                  : strings.header.crumbLobby,
          },
        ];

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
        screen = session.preparing ? (
          <Preparing preparing={session.preparing} detail={seedDetail} />
        ) : onProgress ? (
          <Progress catalogVersion={catalogVersion} hosted={hosted !== undefined} />
        ) : modeBankId ? (
          <Mode
            bankId={modeBankId}
            catalogVersion={catalogVersion}
            onSessionChange={applySession}
            onPreparing={handlePreparing}
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

        if (isMcq) {
          screen = (
            <McqExam session={session} fetchedAt={fetchedAt} onSessionChange={applySession} />
          );
          break;
        }

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

      {session && !booting && session.state !== "running" && (
        <NavBar
          trail={trail}
          nav={nav}
          // An ended attempt pins this screen to <Score> whatever the route
          // says, so a live wordmark link would change the hash and nothing
          // else. Lock it, the way an attempt in progress already does.
          home={session.state !== "ended"}
          menuExtra={
            session.state === "ended" ? (
              <NavMenuSection label={strings.header.menuExam}>
                <NavMenuItem
                  icon="grid"
                  label={strings.control.newAttempt}
                  onSelect={() => {
                    // Clears a stale #/results/<qid> so the reset lands on the
                    // exam list rather than a solutions URL.
                    navigate("/exams");
                    handleNewAttempt();
                  }}
                />
              </NavMenuSection>
            ) : undefined
          }
          session={
            hosted
              ? {
                  login: hosted.me.user?.login ?? "",
                  session: hosted.me.session,
                  onChanged: hosted.refresh,
                }
              : undefined
          }
        >

          {backgroundedJob && (
            <BackgroundJobChip
              job={backgroundedJob}
              bankTitle={bankTitles[backgroundedJob.bank]}
              onReopen={() => setBackgroundedJobId(null)}
            />
          )}
        </NavBar>
      )}
      <main>

        <ScreenTransition
          screenKey={
            booting
              ? "booting"
              : session?.preparing
                ? "preparing"
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
