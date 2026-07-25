// All user-facing copy in one place. Static text lives here as plain
// strings; text with runtime values is a function so call sites can't
// drift from the copy. Keep keys grouped by surface.

export const strings = {
  app: {
    loading: "Loading…",
    cannotReach: (err: string) => `Cannot reach facilitator: ${err}`,
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
    startExam: "Start Exam",
    starting: "Starting…",
  },

  exam: {
    fallbackTitle: "Exam",
    endExam: "End Exam",
    ending: "Ending…",
    confirmTitle: "End the exam?",
    confirmBody:
      "This cannot be undone. The desktop will lock immediately and grading will begin.",
    cancel: "Cancel",
    desktopTitle: "Exam desktop",
  },

  questionPanel: {
    collapse: "Collapse question panel",
    expand: "Expand question panel",
    loading: "Loading…",
    points: (points: number) => `${points} pts`,
    sshHint: (instance: string) => `ssh ${instance}`,
    copyValue: (value: string) => `Copy ${value}`,
    copiedToDesktop: (value: string) => `Copied ${value} — paste with Ctrl+Shift+V`,
    copied: (value: string) => `Copied ${value}`,
    copyFailed: "Could not copy that value.",
  },

  toast: {
    dismiss: "Dismiss notification",
    timeWarning: (minutes: number) => `${minutes} minutes remaining.`,
    desktopReconnecting: "Desktop connection lost. Reconnecting…",
    desktopRestored: "Desktop connection restored.",
  },

  tour: {
    progress: (step: number, total: number) => `${step} of ${total}`,
    skip: "Skip tour",
    next: "Next",
    done: "Got it",
    steps: {
      questions: {
        title: "Your questions",
        body: "Select a question to read it. The chip below the list names the instance to ssh into for that question.",
      },
      timer: {
        title: "The countdown",
        body: "Time is tracked on the server. When it reaches zero the exam ends and grading starts automatically.",
      },
      desktop: {
        title: "Your exam desktop",
        body: "Work here exactly like the real exam: open the terminal, ssh to the named instance, and solve with kubectl. Firefox reaches the allowlisted documentation sites only.",
      },
      end: {
        title: "Finishing",
        body: "Done early? End the exam here. The desktop locks immediately and your score appears when grading completes.",
      },
    },
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
      ["Question pool", "Small curated mocks", "Larger pool, broader coverage"],
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
    restartTour: "Replay the exam tour",
    footerLine: "Independent study tool. Not affiliated with CNCF, The Linux Foundation, PSI, or killer.sh.",
    footerLink: "About & licenses",
  },

  theme: {
    labels: { system: "Auto", light: "Light", dark: "Dark" } as Record<string, string>,
    icons: { system: "◐", light: "☀", dark: "☾" } as Record<string, string>,
    ariaLabel: (current: string) => `Theme: ${current}. Activate to change.`,
  },

  desktop: {
    connecting: "Connecting to the exam desktop…",
    reconnecting: "Desktop connection lost. Reconnecting…",
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
    retry: "Retry",
    dismiss: "Dismiss",
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
    gradingBody: "Evaluating your exam over SSH. This can take a minute.",
    gradingFailedTitle: "Grading failed",
    retry: "Retry",
    pass: "PASS",
    fail: "FAIL",
    pointsDetail: (earned: number, total: number, passingScore: number) =>
      `${earned}/${total} points (passing score ${passingScore}%)`,
    endReason: (reason: string) =>
      reason === "expired"
        ? "Session ended automatically: time expired."
        : "Session ended: answers submitted.",
    showSolution: "Show solution",
    loadingSolution: "Loading solution…",
  },
} as const;
