// All user-facing copy in one place. Static text lives here as plain
// strings; text with runtime values is a function so call sites can't
// drift from the copy. Keep keys grouped by surface.

export const strings = {
  app: {
    loading: "Loading…",
    cannotReach: (err: string) => `Cannot reach facilitator: ${err}`,
    working: "Loading…",
  },

  errorBoundary: {
    title: "Something went wrong",
    reload: "Reload",
  },

  start: {
    fallbackTitle: "kubestronaut-sim",
    durationLabel: "Duration",
    passingScoreLabel: "Passing score",
    questionsLabel: "Questions",
    kubernetesLabel: "Kubernetes",
    tips: [
      "Solve questions over SSH on the named instance (user: candidate).",
      "The desktop's Firefox reaches allowlisted documentation sites only.",
      "Each question has a working directory pre-created at /opt/course/<n>.",
      "The timer starts the moment you click Start and cannot be paused.",
    ],
    // The catalog and the exam summary are separate endpoints, so one can
    // fail while the other renders. Say which one, and that the button
    // below is the thing that will not work.
    examFailed: (detail: string) =>
      `Couldn't load this exam's summary (${detail}). The facilitator may still be starting — check it with \`docker compose ps facilitator\`.`,
    startExam: "Start Exam",
    starting: "Starting…",
    catalogErrorTitle: "Couldn't load the exam catalog",
    catalogErrorBody: (detail: string) =>
      `The control plane did not answer (${detail}). Your current exam below still works — the list of other exams needs the conductor container.`,
    catalogRetry: "Retry",
  },

  exam: {
    fallbackTitle: "Exam",
    loadingQuestions: "Loading the questions…",
    // An empty panel used to be the only symptom of this, which reads
    // exactly like an exam with no questions. Say which part broke, and
    // that the parts the clock depends on did not.
    questionsFailed: (detail: string) =>
      `Couldn't load the question list (${detail}). The timer and the exam desktop are unaffected — the questions are served by the facilitator, so check it is up with \`docker compose ps facilitator\`.`,
    endExam: "End Exam",
    ending: "Ending…",
    // Submitting is the one control that must never fail silently: the
    // server-side clock keeps running whatever the button looks like.
    endFailed: (detail: string) =>
      `Couldn't submit the exam (${detail}). The session is still running — try again, or submit from a desktop.`,
    confirmTitle: "End the exam?",
    confirmBody:
      "This cannot be undone. The desktop will lock immediately and grading will begin.",
    cancel: "Cancel",
    desktopTitle: "Exam desktop",
    resizePanel: "Resize the question panel",
    // aria-valuetext, so a screen reader hears "360 pixels" rather than a
    // bare number whose unit it cannot know.
    resizePanelValue: (px: number) => `${px} pixels`,
    // The countdown is mono digits on purpose — "01:47:12" is scannable to
    // a sighted reader and unreadable to a screen reader, which says it
    // digit-by-digit with the colons. The glyphs are hidden from assistive
    // tech and this spoken form carries the same value instead.
    timeRemaining: (spoken: string) => `Time remaining: ${spoken}`,
  },

  questionPanel: {
    regionLabel: "Questions",
    collapse: "Collapse question panel",
    expand: "Expand question panel",
    loading: "Loading the question…",
    // The clock keeps running through this, so the copy has to say the
    // session is unharmed rather than leave the candidate wondering.
    loadFailed: (detail: string) =>
      `Couldn't load this question (${detail}). The exam is still running — the desktop and the timer are unaffected.`,
    retry: "Retry",
    prev: "Previous question",
    next: "Next question",
    // The navigator's own button opens the full grid, so its accessible
    // name has to carry both where you are and what activating it does.
    position: (n: number, total: number) => `Question ${n} of ${total}. Show all questions.`,
    jumpOpenLabel: "Show all questions",
    // Never "answered" or "done": the UI knows it rendered the text, not
    // that the work was done, and the grader is the only thing that knows
    // the latter.
    mark: "Mark for review",
    marked: "marked for review",
    viewed: "viewed",
    points: (points: number) => `${points} pts`,
    sshHint: (instance: string) => `ssh ${instance}`,
    copyValue: (value: string) => `Copy ${value}`,
    copiedToDesktop: (value: string) => `Copied ${value} — paste with Ctrl+Shift+V`,
    copied: (value: string) => `Copied ${value}`,
    copyFailed: "Could not copy that value.",
  },

  markdown: {
    plainLanguage: "text",
    copyBlock: "Copy",
    copyBlockLabel: (language: string) => `Copy ${language} code block`,
    copiedBlockToDesktop: "Copied to the exam desktop — paste with Ctrl+Shift+V.",
    copiedBlock: "Copied to the clipboard.",
    copyFailed: "Couldn't copy that.",
  },

  toast: {
    dismiss: "Dismiss notification",
    timeWarning: (minutes: number) => `${minutes} minutes remaining.`,
    desktopReconnecting: "Desktop connection lost. Reconnecting…",
    desktopRestored: "Desktop connection restored.",
  },

  intro: {
    title: "How this exam works",
    open: "How this exam works",
    done: "Got it",
    // The schematic is decorative to a sighted reader and load-bearing to
    // a screen reader, so it carries the same four regions in prose.
    schematicAlt:
      "Layout of the exam screen: a question panel on the left, the exam desktop filling the rest, and a bar across the top holding the countdown and the End Exam button.",
    diagramQuestions: "Questions",
    diagramDesktop: "Exam desktop",
    diagramTimer: "1:59:58",
    diagramEnd: "End Exam",
    legend: [
      {
        title: "Questions",
        body: "Step through with ‹ and ›, or the [ and ] keys. Click the question number to see all of them at once and jump anywhere. The chip below names the instance to ssh into. Click any value in the text — a name, a label, an image tag, a path — to copy it, then paste in the desktop terminal with Ctrl+Shift+V.",
      },
      {
        title: "Exam desktop",
        body: "A real Linux desktop. The terminal is already open; ssh to the instance the question names and solve with kubectl. Firefox is there too, limited to the allowlisted documentation sites.",
      },
      {
        title: "The countdown",
        body: "Time is tracked on the server, not in this tab, and cannot be paused. At zero the exam ends and grading starts by itself.",
      },
      {
        title: "Finishing",
        body: "Done early? End the exam here. The desktop locks immediately and your score appears once grading completes.",
      },
    ] as { title: string; body: string }[],
  },

  info: {
    title: "About this simulator",
    open: "About this simulator",
    close: "Close panel",
    compareTitle: "How this compares to the real exam",
    compareAspect: "Aspect",
    compareHere: "This simulator",
    compareReal: "Real exam",
    compareRows: [
      ["Terminal workflow", "SSH to exam instances on a remote desktop", "Same"],
      ["Documentation", "Firefox limited to allowlisted official sites", "Same"],
      ["Timing", "Fixed countdown, auto-submit at zero", "Same"],
      ["Working directories", "Pre-created /opt/course/<n> paths", "Same"],
      ["Cluster", "Local kind cluster (one control plane, one worker)", "Managed multi-node environments"],
      ["Proctoring", "None. No webcam, no ID checks, no lockdown browser", "PSI remote proctoring"],
      [
        "Question pool",
        "One fixed set per exam — you will see the same questions again",
        "Drawn from a much larger pool",
      ],
      ["Retakes", "Reset and retry as often as you like", "Limited, paid retakes"],
    ] as [string, string, string][],
    compareNote:
      "Scores here measure practice progress. They do not predict a real exam result.",
    disclaimerTitle: "Independent project",
    disclaimerBody:
      "Kubestronaut Sim is an independent open-source study tool. It is not affiliated with, endorsed by, or associated with the Cloud Native Computing Foundation, The Linux Foundation, PSI, or killer.sh. Kubernetes and the certification names (CKA, CKAD, CKS, KCNA, KCSA) are trademarks of The Linux Foundation.",
    licensesTitle: "Licenses and credits",
    licenses: [
      "Simulator code: Apache License 2.0",
      "Question banks: Creative Commons BY-SA 4.0",
      "Typefaces: IBM Plex Sans and JetBrains Mono (SIL Open Font License)",
      "Desktop client: built on noVNC (MPL 2.0)",
    ],
    howItWorks: "How this exam works",
    footerLine: "Independent study tool. Not affiliated with CNCF, The Linux Foundation, PSI, or killer.sh.",
  },

  theme: {
    labels: { system: "Auto", light: "Light", dark: "Dark" } as Record<string, string>,
    ariaLabel: (current: string) => `Theme: ${current}. Activate to change.`,
  },

  desktop: {
    connecting: "Connecting to the exam desktop…",
    // Attempt-numbered on purpose. The backoff climbs to 8s and never
    // gives up, so a fixed string looks the same after one second and
    // after three minutes — and "it is still trying" versus "it is stuck"
    // is the only question the candidate actually has.
    reconnecting: (attempt: number) =>
      attempt > 1
        ? `Desktop connection lost. Reconnecting — attempt ${attempt}.`
        : "Desktop connection lost. Reconnecting…",
    skip: "Skip past the exam desktop (it captures Tab while focused)",
  },

  lobby: {
    chooseExam: "Choose your exam",
    active: "Active",
    comingSoon: "Coming soon",
    unavailable: "Unavailable",
    questions: (n: number) => `${n} questions`,
    switchConfirmTitle: (title: string) => `Switch to ${title}?`,
    switchConfirmBody:
      "This wipes all cluster and instance state and rebuilds from scratch. It usually takes about 2–4 minutes.",
    switchConfirm: "Switch exam",
    cancel: "Cancel",
  },

  control: {
    resetTitle: "Rebuilding your exam environment",
    // Takes the exam's catalog title ("CKA Mock Exam 01"), never the
    // bank slug — the slug is an implementation detail.
    switchTitle: (exam: string) => `Switching to ${exam}`,
    failedTitle: (op: string) => (op === "switch" ? "Switch failed" : "Reset failed"),
    // The measured cluster rebuild is 90–240s. Promising "1–2 minutes"
    // and then blowing past it turns a normal wait into a perceived hang.
    hint: "Rebuilding the Kubernetes cluster. Usually about 2–4 minutes — you can leave this tab open.",
    stepOf: (step: number, total: number, label: string) =>
      `Step ${step} of ${total}: ${label}`,
    elapsed: (span: string) => `Elapsed ${span}`,
    reconnecting: "Restarting the exam services. The page will reconnect on its own.",
    background: "Run in background",
    progressLabel: "Rebuild progress",
    reopen: (label: string) => `${label}. Show details.`,
    retry: "Retry",
    // One label for every control action's in-flight state. The request is
    // a 202 that starts a job; "Starting…" is what is literally true
    // between the click and the job appearing.
    starting: "Starting…",
    dismiss: "Dismiss",
    // "HTTP 502" is true and useless. Name the likely cause and the
    // check that confirms it; keep the raw status as trailing detail.
    actionFailed: (detail: string) =>
      `Couldn't reach the control plane (${detail}). The conductor container may be down — check it with \`docker compose ps conductor\`.`,
    newAttempt: "New attempt",
    newAttemptHint:
      "Wipes all cluster and instance state and returns you to the lobby, where you can retry this exam or pick a different one.",
  },

  mobile: {
    // Names the constraint instead of apologising for it, and says why
    // it is a real capability limit rather than a layout preference.
    title: "This exam needs a desktop",
    why: "You work through a full Linux terminal and remote desktop, side by side with the questions — the same split screen as the real exam. That needs a keyboard and room to see both.",
    requirements: [
      "A desktop or laptop browser",
      "A physical keyboard",
      "A window at least 1024px wide",
    ],
    stillAvailable: "You can still browse the exam catalog and read past scores here.",
    continueAnyway: "Continue anyway",
    startDisabled: "Open this on a desktop to start the exam.",
    sessionRunning:
      "An exam is running. The clock keeps going wherever you are — submit here if you cannot get to a desktop in time.",
  },

  score: {
    gradingTitle: "Grading…",
    // "This can take a minute" was a guess, and the measured full 22-question
    // CKAD grade is ~16s. Overstating a wait is the same mistake as
    // understating one — the elapsed counter beside this is the honest
    // answer, so the copy only has to bound it and say not to navigate away.
    gradingBody:
      "Evaluating your exam over SSH. A full bank usually finishes in well under a minute — leave this tab open.",
    gradingFailedTitle: "Grading failed",
    retry: "Retry",
    // The poll could not reach the facilitator. Not terminal — the poll is
    // still running — so the copy says what is happening and that it will
    // keep trying, rather than reading like a dead end.
    pollFailed: (detail: string) =>
      `Still trying to reach the facilitator (${detail}). Retrying every few seconds — leave this tab open.`,
    // The re-grade request itself failed. The Retry button is showing
    // again underneath this, so the copy names the likely check.
    retryFailed: (detail: string) =>
      `Couldn't ask the facilitator to grade again (${detail}). Check the stack is up with \`docker compose ps\`, then retry.`,
    // The percentage is the score screen's heading — the one thing the
    // candidate came for. It reads as a bare number without this prefix,
    // which is only ever announced, never drawn.
    scoreLabel: "Your score",
    pass: "PASS",
    fail: "FAIL",
    pointsDetail: (earned: number, total: number, passingScore: number) =>
      `${earned}/${total} points (passing score ${passingScore}%)`,
    endReason: (reason: string) =>
      reason === "expired"
        ? "Session ended automatically: time expired."
        : "Session ended: answers submitted.",
    checkResult: "Result",
    checkDescription: "Check",
    checkPoints: "Points",
    checkMessage: "Detail",
    checkPassed: "Passed:",
    checkFailed: "Failed:",
    showSolution: "Show solution",
    loadingSolution: "Loading solution…",
  },
} as const;
