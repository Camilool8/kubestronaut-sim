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

  header: {
    wordmark: "kubestronaut",
    wordmarkTail: "-sim",
    navLabel: "Sections",
    backToExams: "Exams",

    crumbLobby: "Choose an exam",
    crumbResults: "Results",
    crumbProgress: "Your path",

    navExams: "Exams",
    navProgress: "Progress",

    menuLabel: "Menu",

    menuGo: "Go to",
    menuThisApp: "This app",
    menuAccount: "Account",
    menuExam: "This attempt",
    menuNextAttempt: "Next attempt",

    trailLabel: "Where you are",

    backTo: (parent: string) => `Back to ${parent}`,
  },

  exams: {
    title: "Path to Kubestronaut",
    lead: "Five certifications. Pick one to drill, or resume where you stopped.",

    coverageLabel: "Progress",
    coverage: (passed: number, total: number) => `${passed} of ${total} passed`,
    live: "Live",
    soon: "Soon",
    unavailable: "Unavailable",
    liveListLabel: "Exams you can sit",
    soonListLabel: "Exams not built yet",

    wrongSeat: "Not in this seat",
    wrongSeatNote: (needs: string) =>
      `This is a ${needs} exam and you are in the other kind of seat. End this session and start a ${needs.toLowerCase()} one to sit it.`,

    otherExamNote:
      "You started a session for a different exam, and this environment was built for that one. End the session and start this exam to sit it — your finished attempts are kept either way.",

    durationLabel: "Duration",
    passingLabel: "To pass",
    engineLabel: "Engine",

    drawnLabel: "Drawn / pool",
    tasksLabel: "Tasks",
    questionsLabel: "Questions",
    enginePractical: "Practical",

    engineMcq: "MCQ",
    engineUnknown: "Not built",

    bestLabel: (counted: number) =>
      counted === 1 ? "Best attempt · 1 session" : `Best attempt · ${counted} sessions`,

    bestPassed: (counted: number) =>
      counted === 1 ? "Passed · 1 session" : `Passed · ${counted} sessions`,
    bestDrills: (attempts: number) =>
      attempts === 1 ? "1 drill · none counted" : `${attempts} drills · none counted`,

    bestNoScore: "—",

    choose: "Choose a mode",

    certNames: {
      CKAD: "Certified Kubernetes Application Developer",
      CKA: "Certified Kubernetes Administrator",
      CKS: "Certified Kubernetes Security Specialist",
      KCNA: "Kubernetes and Cloud Native Associate",
      KCSA: "Kubernetes and Cloud Native Security Associate",
    } as Record<string, string>,
    catalogErrorTitle: "Couldn't load the exam catalog",
    catalogErrorBody: (detail: string) =>
      `The control plane did not answer (${detail}). This list comes from the conductor container; check it is up with \`docker compose ps conductor\`.`,
    catalogRetry: "Retry",

    empty: "No exams are installed. The banks directory is mounted read-only into the conductor; check it is not empty.",
  },

  mode: {
    title: "How do you want to sit it?",
    lead: "Every mode uses the same tasks and the same grader. What changes is the clock and what you're allowed to lean on.",

    untimed: "No limit",

    fullClock: (full: string) => `${full} in the real exam`,
    recommended: "Recommended",

    capHelp: "Hints and reference solutions",
    capGrade: "Grade your work without ending the attempt",
    capRecorded: "Kept as an attempt",
    capYes: "Yes:",
    capNo: "No:",
    capListLabel: "What this mode allows",
    start: (label: string) => `Start ${label}`,

    startFiltered: (label: string) => `Start ${label} drill`,
    starting: "Starting…",

    // A pooled bank draws its tasks now and seeds them on the cluster before
    // the attempt begins, which is minutes of waiting after the button is
    // pressed. Saying so here is worth more than any amount of spinner.
    seedNotice: (drawn: number) =>
      `Starting draws ${drawn} tasks and sets them up on the cluster first. That takes a few minutes, and your clock does not start until it is done.`,

    drawTitle: "What you'll be asked",
    drawPooled: (drawn: number, pool: number) =>
      `${drawn} drawn at random from ${pool}, weighted to the published domain split. A different set every attempt.`,
    drawPooledMixed: (drawn: number, pool: number) =>
      `${drawn} drawn at random from ${pool}, weighted to the published domain split and mixed across three levels, so a sitting is not a wall of long tasks. A different set every attempt.`,
    drawAll: (n: number) =>
      `All ${n}, every attempt. This bank has no larger pool behind it yet, so the set does not change between sessions.`,

    drawNarrowed: (drawn: number, pool: number, domains: number) =>
      `${drawn} of ${pool}, from the ${domains === 1 ? "domain" : `${domains} domains`} you picked.`,

    chipsTitle: "Narrow the draw",
    chipsLabel: "Curriculum domains to draw from",
    allDomains: "All domains",

    filteredNote: (chosen: number, total: number) =>
      `Drawing from ${chosen} of ${total} domains. A narrowed draw is practice, not a sitting: it is graded and kept in your history, but it is never reported as a pass and it does not count toward your path.`,

    domainsPool: "Domains in the pool",
    domainsExam: "Domains in this exam",
    examFailed: (detail: string) =>
      `Couldn't load this exam (${detail}). The facilitator may still be starting; check it with \`docker compose ps facilitator\`.`,

    wrongExam: "That exam isn't loaded any more. Back to the exam list…",

    tips: [
      "Solve questions over SSH on the named instance (user: candidate).",
      "The desktop's Firefox reaches allowlisted documentation sites only.",
      "Each question has a working directory pre-created at /opt/course/<n>.",
    ],

    tipsMcq: [
      "Answer in the question panel: pick an option and it saves immediately.",
      "Multi-select questions score all-or-nothing: every correct option, nothing else.",
      "You can change any answer until you submit or time runs out.",
    ],

    tipTimer:
      "Training is untimed. Exam and Mastery start their clock the moment you start, and it cannot be paused.",
  },

  exam: {
    fallbackTitle: "Exam",
    loadingQuestions: "Loading the questions…",

    questionsFailed: (detail: string) =>
      `Couldn't load the question list (${detail}). The timer and the exam desktop are unaffected. The questions are served by the facilitator, so check it is up with \`docker compose ps facilitator\`.`,

    endAttempt: (mode: string) => (mode === "training" ? "Submit session" : "Submit exam"),
    ending: "Ending…",

    moreLabel: "Exam controls",

    positionShort: (n: number, total: number) => `${n}/${total}`,

    endFailed: (detail: string) =>
      `Couldn't submit the exam (${detail}). The session is still running; try again, or submit from a desktop.`,

    confirmTitle: (mode: string) =>
      mode === "training" ? "Submit this training session?" : "Submit the exam?",

    reviewMarked: (n: number) =>
      n === 1 ? "1 task is marked for review:" : `${n} tasks are marked for review:`,

    reviewUnseen: (n: number) =>
      n === 1 ? "1 task was never opened:" : `${n} tasks were never opened:`,

    taskNumber: (n: number) => `Task ${n}`,
    confirmBody: (mode: string) =>
      mode === "training"
        ? "This ends the session for good; the desktop locks and your work is scored. A training score is feedback on where you stand, not an exam result."
        : "This cannot be undone. The desktop will lock immediately and grading will begin.",
    cancel: "Cancel",
    desktopTitle: "Exam desktop",
    resizePanel: "Resize the question panel",

    resizePanelValue: (px: number) => `${px} pixels`,

    timeRemaining: (spoken: string) => `Time remaining: ${spoken}`,

    timeElapsed: (span: string) => `Time elapsed: ${span}`,

    environment: (version: string, hosts: string) =>
      hosts
        ? `Kubernetes ${version} · ${hosts} reachable over ssh`
        : `Kubernetes ${version}`,

    progress: (opened: number, total: number, flagged: number) =>
      flagged > 0
        ? `${opened} of ${total} opened · ${flagged} flagged`
        : `${opened} of ${total} opened`,
  },

  questionPanel: {
    regionLabel: "Questions",
    loading: "Loading the question…",

    loadFailed: (detail: string) =>
      `Couldn't load this question (${detail}). The exam is still running; the desktop and the timer are unaffected.`,
    retry: "Retry",
    prev: "Previous question",
    next: "Next question",

    mark: "Mark for review",
    points: (points: number) => `${points} pts`,
    sshHint: (instance: string) => `ssh ${instance}`,
    copyValue: (value: string) => `Copy ${value}`,

    copiedToDesktop: (value: string, chord: string) => `Copied ${value}. Paste with ${chord}`,
    copied: (value: string) => `Copied ${value}`,
    copyFailed: "Could not copy that value.",

    taskCounter: (n: number, total: number) =>
      `Task ${String(n).padStart(String(total).length, "0")} / ${total}`,

    markKey: "F",

    weightShare: (pct: number) => `Weight ${pct < 1 ? "<1" : Math.round(pct)}%`,
    weightShareNote: (pct: number) =>
      `This task is worth ${pct < 1 ? "under 1" : Math.round(pct)}% of the exam's points.`,

    targetTime: (span: string) => `Target ${span}`,
    targetTimeNote:
      "A pacing budget, not a limit. Nothing enforces it and running over costs no points.",

    targetTimeDerived: (span: string) => `Target ≈${span}`,
    targetTimeDerivedNote:
      "Derived from this task's share of the exam clock, not a measured time. A pacing budget, not a limit — running over costs no points.",

    workFrom: "Work from",
    copyShort: "Copy",

    prevShort: "Previous",
    nextShort: "Next",
    allTasks: "All tasks",
  },

  navigator: {
    open: "Show all questions",
    position: (n: number, total: number) => `Question ${n} of ${total}. Show all questions.`,
    regionLabel: "All questions",
    filterLabel: "Show",
    filterAll: "All",
    filterFlagged: "Flagged",

    filterUnseen: "Unseen",
    filterUnanswered: "Unanswered",
    legendCurrent: "Current",
    legendOpened: "Opened",
    legendAnswered: "Answered",
    legendFlagged: "Flagged",
    legendUnseen: "Unseen",
    legendUnanswered: "Unanswered",

    opened: "opened",
    unseen: "not opened",
    answered: "answered",
    unanswered: "unanswered",
    flagged: "flagged for review",

    emptyFlagged: "Nothing is flagged. Press F on a tile, or use Mark for review.",
    emptyUnseen: "Every question has been opened.",
    emptyUnanswered: "Every question has an answer.",

    keyLeft: "Left arrow",
    keyRight: "Right arrow",
    keyMove: "move",
    keyFlagKey: "F",
    keyFlag: "flag",
    keyGridKey: "G",
    keyGrid: "grid",
    keyDigits: "1–9",
    keyJump: "jump",
  },

  markdown: {
    plainLanguage: "text",
    copyBlock: "Copy",
    copyBlockLabel: (language: string) => `Copy ${language} code block`,
    copiedBlockToDesktop: (chord: string) => `Copied to the exam desktop. Paste with ${chord}.`,
    copiedBlock: "Copied to the clipboard.",
    copyFailed: "Couldn't copy that.",
  },

  toast: {
    dismiss: "Dismiss notification",
    timeWarning: (minutes: number) => `${minutes} minutes remaining.`,
    desktopReconnecting: "Desktop connection lost. Reconnecting…",
    desktopRestored: "Desktop connection restored.",
  },

  tips: {
    title: "Exam tips",
    open: "Exam tips",
    lead: "Technique for this exam, not answers — how to set the terminal up, generate manifests instead of typing them, and find things faster than the documentation can.",
    done: "Close",
    failed: (message: string) => `The tips could not be loaded: ${message}`,
  },

  intro: {
    title: "How this exam works",
    open: "How this exam works",
    done: "Got it",

    schematicAlt:
      "Layout of the exam screen: a question panel on the left, the exam desktop filling the rest, and a bar across the top holding the countdown and the Submit exam button.",
    diagramQuestions: "Questions",
    diagramDesktop: "Exam desktop",

    diagramTimerLabel: "Time left",
    diagramEnd: "Submit exam",
    legend: [
      {
        title: "Questions",
        body: "Step through with ‹ and ›, or the [ and ] keys. Click the question number to see all of them at once and jump anywhere. The chip below names the instance to ssh into. Click any value in the text (a name, a label, an image tag, a path) to copy it, then paste in the desktop terminal.",
      },
      {
        title: "Exam desktop",
        body: "A real Linux desktop. The terminal is already open; ssh to the instance the question names and solve with kubectl — it already points at this cluster on every instance, so there is no context to switch. Firefox is there too, limited to the allowlisted documentation sites.",
      },
      {
        title: "The countdown",
        body: "Time is tracked on the server, not in this tab, and cannot be paused. At zero the exam ends and grading starts by itself.",
      },
      {
        title: "Finishing",
        body: "Done early? Submit here. The desktop locks immediately and your score appears once grading completes.",
      },
    ] as { title: string; body: string }[],

    methodTitle: "How grading works",
    method:
      "Every task is scored by checks that read the state you leave behind — what is on the cluster and on the exam instances when grading runs, never the commands you typed. How you got there does not matter: a kubectl one-liner, an applied manifest and an edit in place all score the same. Each task's share of the exam is on the chip row beside its title.",
  },

  info: {
    title: "About this simulator",
    open: "About this simulator",
    close: "Close panel",

    scopeTitle: "One part of preparing",
    scopeBody:
      "This is one part of getting ready, not the whole of it. It does not replace working a problem out for yourself, the lab you build at home, or the Linux Foundation's own training. What it adds is a timed rehearsal on a real cluster and a score you can trust.",
    compareTitle: "How this compares to the real exam",
    compareAspect: "Aspect",
    compareHere: "This simulator",
    compareReal: "Real exam",
    compareRows: [
      ["Terminal workflow", "SSH to exam instances on a remote desktop", "Same"],
      ["Documentation", "Firefox limited to allowlisted official sites", "Same"],
      ["Timing", "Fixed countdown, auto-submit at zero", "Same"],
      ["Working directories", "Pre-created /opt/course/<n> paths", "Same"],

      ["Cluster", "A local kind cluster, sized for the exam you pick", "Managed multi-node environments"],
      ["Proctoring", "None. No webcam, no ID checks, no lockdown browser", "PSI remote proctoring"],
      [
        "Question pool",

        "Some exams draw a fresh subset from a larger pool; the rest ask every question they hold",
        "Drawn from a much larger pool",
      ],
      ["Retakes", "Reset and retry as often as you like", "Limited, paid retakes"],
    ] as [string, string, string][],
    compareNote:
      "Scores here measure practice progress. They do not predict a real exam result.",
    disclaimerTitle: "Independent project",
    disclaimerBody:
      "Kubestronaut Sim is an independent open-source study tool. It is not affiliated with, endorsed by, or associated with the Cloud Native Computing Foundation, The Linux Foundation, or PSI. Kubernetes and the certification names (CKA, CKAD, CKS, KCNA, KCSA) are trademarks of The Linux Foundation.",
    licensesTitle: "Licenses and credits",
    authorName: "Camilo Joga",
    authorUrl: "https://cjoga.cloud",
    authorFooter: "Built by",
    authorCredit: "Created and maintained by",
    licenses: [
      "Simulator code: Apache License 2.0",
      "Question banks: Creative Commons BY-SA 4.0",
      "Typefaces: IBM Plex Sans and IBM Plex Mono in the app, JetBrains Mono on the exam desktop (SIL Open Font License)",
      "Desktop client: built on noVNC (MPL 2.0)",
    ],
    howItWorks: "How this exam works",
    footerLine: "Independent study tool. Not affiliated with CNCF, The Linux Foundation, or PSI.",
  },

  theme: {
    labels: { system: "Auto", light: "Light", dark: "Dark" } as Record<string, string>,
    ariaLabel: (current: string) => `Theme: ${current}. Activate to change.`,

    menuLabel: "Theme",
  },

  desktop: {
    connecting: "Connecting to the exam desktop…",

    reconnecting: (attempt: number) =>
      attempt > 1
        ? `Desktop connection lost. Reconnecting, attempt ${attempt}.`
        : "Desktop connection lost. Reconnecting…",
    skip: "Skip past the exam desktop (it captures Tab while focused)",
  },

  lobby: {
    switchConfirmTitle: (title: string) => `Load ${title}?`,
    switchConfirmBody:
      "Only one exam can be loaded at a time. Switching wipes all cluster and instance state and rebuilds from scratch, which usually takes about 2-4 minutes. You can leave the tab open while it runs.",
    switchConfirm: "Load it",
    buildConfirmTitle: (title: string) => `Set up ${title}?`,
    buildConfirmBody:
      "This builds the Kubernetes cluster for this exam and sets up its tasks, which usually takes about 2-4 minutes. You can leave the tab open while it runs, and you can switch to a different exam afterwards.",

    buildConfirm: "Build it",
    cancel: "Cancel",
  },

  modes: {
    training: {
      label: "Training",
      badge: "LEARN",

      blurb: () =>
        "No clock. Hints unlock on request, reference solutions are one click away, and you can grade your work without ending the attempt.",
    },
    speed: {
      label: "Mastery",
      badge: "SPEED",
      blurb: (mins: number) =>
        `${mins} minutes — half the real clock, everything else identical to exam conditions. Clear the tasks at this pace and the real thing will feel slow.`,
    },
    exam: {
      label: "Exam",
      badge: "REAL",
      blurb: (mins: number) =>
        `${mins} minutes, one attempt at the clock. No hints, and nothing is graded until you submit — the same as the day itself.`,
    },
  },

  hints: {
    show: (tier: number, total: number) => `Show hint ${tier} of ${total}`,
    heading: (tier: number, total: number) => `Hint ${tier} of ${total}`,
    showSolution: "Show solution",
    reseed: "Reset this question",
    reseeding: "Resetting…",
    reseedTitle: "Reset this question?",

    reseedBody:
      "This re-runs the question's setup, putting it back exactly as it started. Anything you have done for this question is discarded. Other questions are untouched.",
    reseedConfirm: "Reset it",
    reseedDone: "Question reset to its starting state.",
    docsTitle: "Read up on this",
    docsHint: "Opens as a tab in the exam desktop's browser.",
    docsOpen: (label: string) => `Open ${label} on the exam desktop`,
    docsOpened: (label: string) => `${label} is open in the exam desktop's browser.`,
    docsFailed: (detail: string) => `Couldn't open that page on the exam desktop (${detail}).`,
    reseedFailed: (detail: string) => `Couldn't reset that question (${detail}).`,
    examOnly: "Hints are available in Training mode.",
    failed: (detail: string) => `Couldn't load that hint (${detail}).`,
  },

  mcq: {
    regionLabel: "Question",
    selectOne: "Select one answer",
    selectAll: "Select all that apply",

    questionNumber: (n: number) => `Q${n}`,

    optionLabel: (letter: string, text: string) => `${letter}. ${text}`,

    saveFailed: (detail: string) =>
      `Couldn't save that answer (${detail}). It is not recorded; pick it again to retry.`,

    saveConflict: "The attempt has ended; that last change wasn't recorded.",

    reviewUnanswered: (n: number) =>
      n === 1 ? "1 question is unanswered:" : `${n} questions are unanswered:`,
    allAnswered: "Every question has an answer.",
    confirmBody: (mode: string) =>
      mode === "training"
        ? "This ends the session for good; your answers are already saved. A training score is feedback on where you stand, not an exam result."
        : "This cannot be undone. Your answers are already saved; grading begins immediately.",

    checkAnswer: "Check answer",
    loadingAnswer: "Loading the explanation…",

    yourAnswer: "Your answer",
    correctAnswer: "Correct answer",
    notAnswered: "Not answered",
    explanation: "Explanation",
    optionCorrectSelected: "correct, and you selected it",
    optionCorrectMissed: "correct, and you did not select it",
    optionWrongSelected: "your selection, incorrect",

    questionCounter: (n: number, total: number) => `Question ${n} / ${total}`,

    answeredLabel: "Progress",
    tally: (answered: number, flagged: number, unseen: number) =>
      `Answered ${answered} · Flagged ${flagged} · Unseen ${unseen}`,

    saveNote: "Answers save as you go · nothing is graded until submit",

    navigator: "Navigator",
  },

  practice: {
    scoreNow: "Score my work",
    scoring: "Scoring…",
    title: "Your work so far",

    note: "Not recorded, and not your final score. This is where you stand right now.",
    close: "Close",
    failed: (detail: string) => `Couldn't score right now (${detail}).`,

    questionScore: (label: string, earned: number, total: number) => `${label}: ${earned}/${total}`,
  },

  clipboard: {
    title: "Clipboard",
    open: "Clipboard",

    blocked: "Your browser won't let this page read the clipboard. Use the Clipboard panel to send text to the desktop.",
    toDesktopLabel: "Send to the exam desktop",
    toDesktopHint: "Paste here, then Send. Useful for anything the desktop cannot read from your clipboard directly.",
    send: "Send",
    sent: "Sent to the exam desktop.",
    sendFailed: "No desktop connected.",
    fromDesktopLabel: "Copied on the exam desktop",

    fromDesktopEmpty: "Nothing yet. Copy something in the exam terminal and it appears here.",
    copyToHost: "Copy",
    copiedToHost: "Copied to your clipboard.",
  },
  keyboard: {
    settingsLabel: "Keyboard",
    settingsTitle: "Keyboard",
    macToggle: "Translate Mac shortcuts",

    macToggleHint:
      "⌘C becomes the exam terminal's Ctrl+Shift+C, plus word and line movement (⌘←/→, ⌥←/→, ⌘⌫). Everything else is passed through untouched.",
    reservedToggle: "Also map ⌘T and ⌘W",
    reservedHint:
      "Off by default: most browsers reserve new tab and close tab, and will act on them before this page can.",
    helpOpen: "Keyboard shortcuts",
    helpTitle: "Keyboard shortcuts",
    helpBrowser: "In the exam page",
    helpDesktop: "On the exam desktop",
    helpDesktopNote:
      "Sent to the desktop instead of what your Mac would normally do. Without this, ⌘ arrives as Super and does nothing.",
    colPress: "Press",
    colSends: "Sends",
    colDoes: "Does",
    noneMac: "No shortcuts are being translated. This is not a Mac, or translation is switched off.",

    browserShortcuts: [
      ["[  /  ]", "Previous / next question"],
      ["G", "Show or hide the question grid"],
      ["Arrows", "Move between tiles, in the grid"],
      ["1 – 9", "Jump to a tile, in the grid"],
      ["F", "Flag this question, or the tile you are on"],
      ["?", "This list"],
      ["Esc", "Close a panel or dialog"],
      ["← / →", "Resize the question panel (when the divider has focus)"],
      ["Shift + ← / →", "Resize in bigger steps"],
      ["Home / End", "Narrowest / widest panel"],
    ],
  },

  keymap: {
    copy: "Copy",
    paste: "Paste",
    clearScreen: "Clear the screen",
    startOfLine: "Start of line",
    endOfLine: "End of line",
    backWord: "Back one word",
    forwardWord: "Forward one word",
    deleteToStartOfLine: "Delete to start of line",
    newTerminalTab: "New terminal tab",
    closeTerminalTab: "Close terminal tab",
  },
  boot: {
    title: "Building your exam environment",

    hint: "The first run pulls images and builds the environment, which takes several minutes. Later runs resume in seconds. You can leave this tab open.",
    stepOf: (step: number, total: number, label: string) => `Step ${step} of ${total}: ${label}`,
    elapsed: (span: string) => `Elapsed ${span}`,
    progressLabel: "Environment build progress",
    failedTitle: "The exam environment failed to start",

    failedHint:
      "Nothing was lost: no attempt had started. `docker compose logs k8s-env` has the full output.",
    retry: "Try building again",

    unreachable: "Waiting for the exam services to start…",

    phaseLabels: {
      dockerd: "Starting the container runtime",
      "helm-repo": "Publishing the local Helm repository",
      "create-cluster": "Creating the Kubernetes cluster",
      "api-server": "Waiting for the API server",
      cni: "Installing the pod network",
      ingress: "Installing the ingress controller",
      // The live label from bootstrap.sh replaces this while the phase runs;
      // it has to stay true for both branches, because a pooled bank only
      // preloads images here and seeds its tasks when an attempt starts.
      seed: "Preparing the exam content",
      finalize: "Finishing up",
    },
  },
  control: {
    resetTitle: "Rebuilding your exam environment",

    switchTitle: (exam: string) => `Switching to ${exam}`,

    provisionTitle: (exam: string) => `Building your ${exam} environment`,

    seedTitle: "Setting up your tasks",
    failedTitle: (op: string) =>
      op === "switch"
        ? "Switch failed"
        : op === "provision"
          ? "Setup failed"
          : op === "seed"
            ? "Setup failed"
            : "Reset failed",

    hint: "Rebuilding the Kubernetes cluster. Usually about 2-4 minutes. You can leave this tab open.",

    hintProvision:
      "Building the Kubernetes cluster and setting up the tasks. Usually about 2-4 minutes. You can leave this tab open.",

    hintFast: "Restarting the exam services. Usually a few seconds.",

    hintSeed:
      "Preparing the cluster for the tasks in this draw. Your clock has not started and will not start until this finishes.",
    stepOf: (step: number, total: number, label: string) =>
      `Step ${step} of ${total}: ${label}`,
    elapsed: (span: string) => `Elapsed ${span}`,
    reconnecting: "Restarting the exam services. The page will reconnect on its own.",

    showLog: "Show build log",
    logLabel: "Build log",
    logEmpty: "No output yet. The current phase has not printed anything.",
    logUnavailable: "The log pauses while the exam services restart.",
    background: "Run in background",
    progressLabel: "Rebuild progress",
    reopen: (label: string) => `${label}. Show details.`,
    retry: "Retry",

    starting: "Starting…",
    dismiss: "Dismiss",

    actionFailed: (detail: string) =>
      `Couldn't reach the control plane (${detail}). The conductor container may be down; check it with \`docker compose ps conductor\`.`,
    newAttempt: "New attempt",
    newAttemptHint:
      "Wipes all cluster and instance state and returns you to the lobby, where you can retry this exam or pick a different one.",

    prepareFailed: (detail: string) =>
      `The exam environment couldn't be set up, so the attempt never started and no time was used (${detail}). Try starting it again.`,
  },

  preparing: {
    body: (tasks: number) =>
      tasks === 1
        ? "Setting up the 1 task in this draw on the cluster."
        : `Setting up the ${tasks} tasks in this draw on the cluster.`,

    elapsed: (span: string) => `Elapsed ${span}`,
  },

  mobile: {
    title: "This exam needs a desktop",
    why: "You work through a full Linux terminal and remote desktop, side by side with the questions, the same split screen as the real exam. That needs a keyboard and room to see both.",
    requirements: [
      "A desktop or laptop browser",
      "A physical keyboard",
      "A window at least 1024px wide",
    ],
    stillAvailable: "You can still browse the exam catalog and read past scores here.",
    continueAnyway: "Continue anyway",
    startDisabled: "Open this on a desktop to start the exam.",

    needsDesktop: "Needs a desktop",
    catalogNote:
      "This exam is a Linux terminal and a remote desktop beside the questions. That needs a keyboard and a desktop browser, so it cannot be started from this device.",
    lobbyNote:
      "This exam is a Linux terminal and a remote desktop beside the questions, so it needs a keyboard and a desktop browser. Starting it here would hold a seat nobody could sit — open the hub on a desktop to take one.",
    sessionRunning:
      "An exam is running. The clock keeps going wherever you are; submit here if you cannot get to a desktop in time.",

    sessionRunningUntimed:
      "A training attempt is open. There is no time limit; pick it up on a desktop whenever you are ready, or submit it here.",
  },

  score: {
    gradingTitle: "Grading…",

    gradingBody:
      "Evaluating your exam over SSH. A full bank usually finishes in well under a minute; leave this tab open.",
    gradingFailedTitle: "Grading failed",
    retry: "Retry",

    pollFailed: (detail: string) =>
      `Still trying to reach the facilitator (${detail}). Retrying every few seconds; leave this tab open.`,

    retryFailed: (detail: string) =>
      `Couldn't ask the facilitator to grade again (${detail}). Check the stack is up with \`docker compose ps\`, then retry.`,

    eyebrowSeparator: " · ",
    listSeparator: ", ",
    runLabel: (mode: string) => `${mode} run`,

    drawSeedLabel: "draw seed",

    headlinePass: (percent: number, passing: number) =>
      `Passed — ${percent}% against a ${passing}% threshold`,
    headlineFail: (percent: number, passing: number) =>
      `Not passed — ${percent}% against a ${passing}% threshold`,

    headlineFiltered: (percent: number) => `${percent}% on a filtered draw`,
    filteredNote: (domains: string) =>
      `This run drew only from ${domains}. It measures those domains, not the certification, so there is no pass or fail here.`,

    summaryTasks: (correct: number, partial: number, total: number) =>
      partial > 0
        ? `${correct} of ${total} tasks fully correct, ${partial} partially credited.`
        : `${correct} of ${total} tasks fully correct.`,
    summaryTimeLeft: (left: string, clock: string) =>
      `You finished with ${left} left on a ${clock} clock.`,
    summaryTimeAll: (clock: string) => `You used the whole ${clock}.`,
    summaryUntimed: "This attempt ran without a clock.",
    summaryWeakOne: (domain: string, passing: number) =>
      `${domain} is the only domain below ${passing}%.`,
    summaryWeakMany: (count: number, passing: number) =>
      `${count} domains came in below ${passing}%; the breakdown lists them weakest first.`,
    summaryWeakNone: (passing: number) => `Every domain cleared ${passing}%.`,

    statScore: "Weighted score",
    statTimeUsed: (clock: string) => `of ${clock} used`,
    statTimeOpen: "On the clock",
    statPoints: "Points earned",

    meterFloor: "0%",
    meterCeiling: "100%",
    meterPass: (passing: number) => `pass ${passing}%`,

    pointsDetail: (earned: number, total: number, passingScore: number) =>
      `${earned}/${total} points (passing score ${passingScore}%)`,

    weightedNote: (raw: number) =>
      `Raw points come to ${raw}%. The weighted score counts each domain at its published curriculum share, and that is the figure the threshold is applied to.`,

    domainTitle: "Domain breakdown",

    domainHint:
      "Weighted to the published curriculum, weakest first — this is where the next hour of study pays most.",

    domainHintUnweighted:
      "Weakest first, by points. This is where the next hour of study pays most.",
    domainMeta: (count: number, total: number, earned: number, points: number) =>
      `${count} of ${total} tasks · ${earned}/${points} pts`,
    domainMetaWeighted: (
      weight: number,
      count: number,
      total: number,
      earned: number,
      points: number,
    ) => `${weight}% of exam · ${count} of ${total} tasks · ${earned}/${points} pts`,

    levelTitle: "By task length",
    levelHint:
      "The same attempt cut by how long each task was meant to take. Levels are time bands, not a judgement of how clever a task is.",
    levelNames: {
      quick: "Quick — up to 4 min",
      core: "Core — 4 to 9 min",
      deep: "Deep — 9 to 14 min",
    } as Record<string, string>,
    levelMeta: (count: number, earned: number, points: number) =>
      `${count} ${count === 1 ? "task" : "tasks"} · ${earned}/${points} pts`,

    levelSlump:
      "Your score falls away as the tasks get longer. That is usually pacing rather than missing knowledge — the fix is to plan a long task into steps before you start typing, not to read more.",
    levelFlat:
      "Your score holds up across short and long tasks, so length is not what is costing you.",

    domainBelow: "below threshold",
    domainUnknown: "Unclassified",

    nextTitle: "Next session",
    nextWeak: (domains: string) =>
      `Put the next study hour into ${domains}, then draw a fresh set.`,
    nextSolid: "Nothing fell below the threshold. Draw a fresh set and hold this pace.",
    nextDrill: "Drill these domains",

    nextDrillHint:
      "Rebuilds the environment first, then opens the mode screen with these domains picked. A drill is not a sitting — it will not set a best score.",

    verdictsTitle: "Task verdicts",

    verdictsHint:
      "Open a row to read the grader's checks against each other. Open a task in full for its reference solution and whatever state its checks captured.",

    openExplain: (n: number) => `Open task ${n}'s full explanation`,
    filterLabel: "Filter task verdicts",
    filterAll: "All",
    filterFailed: "Failed",
    filterPartial: "Partial",
    filterFlagged: "Flagged",
    filterEmpty: "Nothing matches that filter.",
    colNum: "#",
    colTask: "Task",
    colWeight: "Weight",
    colTime: "Time",
    colVerdict: "Verdict",

    metaSeparator: " · ",

    srWeight: "Weight",

    srTime: "Task pane open",
    srOverTarget: (over: string, target: string) => `${over} over the ${target} target`,
    overTarget: (over: string) => `+${over}`,
    verdictCorrect: "CORRECT",
    verdictPartial: "PARTIAL",
    verdictFailed: "FAILED",
    percentValue: (pct: number) => `${pct}%`,

    notRecorded: "—",
    notRecordedLabel: "not recorded",
    modeNote: (mode: string) => `${mode} attempt: not a comparable exam result.`,
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
    checkSkipped: "Skipped:",

    checkSkippedMessage: "Not graded: this check's points header is malformed in the bank.",

  },

  explain: {
    eyebrowSeparator: " · ",

    taskLabel: (n: number, total: number) =>
      `Task ${String(n).padStart(String(total).length, "0")}`,

    weight: (pct: number) => `weight ${pct < 1 ? "<1" : Math.round(pct)}%`,

    timing: (open: string) => `${open} on this task`,
    timingTarget: (open: string, target: string) => `${open} · target ${target}`,
    pointsLabel: "Points",

    prevTask: (n: number) => `Task ${n}`,
    nextTask: (n: number) => `Task ${n}`,
    prevLabel: "Previous task",
    nextLabel: "Next task",
    navLabel: "Step between tasks",
    backToResults: "All task verdicts",

    checksTitle: "Grader checks",

    answerTitle: "Your answer",

    checksNone: "The grader recorded no checks for this task.",

    evidenceTitle: (checks: number) =>
      checks === 1 ? "What this check saw" : "What these checks saw",

    actualTitle: "Your cluster state",
    expectedTitle: "Expected",
    whyTitle: "Why this scored what it did",

    diffLegend:
      "Lines marked - are in your state and not in the expected document; lines marked + are in the expected document and not in yours.",

    lineChanged: "Differs:",

    diffIdentical:
      "These two documents match line for line. Whatever the check measured is not visible in what it captured — the message above names it.",

    diffTooLong:
      "These documents are too long to compare line by line, so neither pane is marked up. Both are shown in full.",

    actualOnlyNote:
      "This is what the check read off the cluster. It has no authored counterpart to sit beside, so compare it against the reference solution below.",

    expectedOnlyNote:
      "This is what the check was looking for. Nothing was captured from your cluster to sit beside it, which usually means the object does not exist yet.",

    correctTitle: "Full marks on this task",
    correctBody:
      "Every check passed. The reference solution below is still worth a look — it is one way to get here, not the only one, and the grader scored the state you left rather than the route you took.",

    noEvidenceTitle: "No captured state for this task",
    noEvidenceBody:
      "These checks report what they measured without keeping a copy of what they read, so there is nothing to set side by side. The messages above are the evidence — each one names the field it looked at and what it found there — and the reference solution below is the shape they were looking for.",

    solutionTitle: "Reference solution",
    solutionLoading: "Loading the reference solution…",
    solutionFailed: (detail: string) => `Couldn't load the reference solution (${detail}).`,

    solutionHistorical:
      "This attempt was saved before reference solutions were kept alongside them, and the environment it was taken in is long gone. Newer attempts carry theirs; the checks, the captured state and the score above are all recorded here.",

    docsTitle: "Upstream documentation",

    docsNewTab: "opens in a new tab",

    unknownTask: "That task isn't part of this attempt.",
  },

  progress: {
    title: "Your path",

    lead: "Every attempt this environment has graded. Kept in its own volume rather than in this browser, so a reset, a bank switch and a purge all leave it where it is.",

    leadHosted:
      "Every attempt you have finished here. Kept against your account rather than in the environment, so it outlives every session you start. Open one to read it back in full.",
    export: "Export",

    exportHint: "Downloads every attempt as a JSON file.",
    import: "Import",
    importHint: "Merges a previous export back in. Attempts already here are left alone.",
    importBusy: "Importing…",

    importPick: "Choose an exported history file",
    importDone: (imported: number, skipped: number) =>
      skipped > 0
        ? `Imported ${imported}; ${skipped} were already here.`
        : `Imported ${imported}.`,
    importFailed: (detail: string) => `Couldn't import that file (${detail}).`,
    erase: "Erase history",
    eraseConfirmTitle: "Erase every attempt?",
    eraseConfirmBody:
      "This deletes the whole record — every certification, every score. There is no undo and no server-side backup. Export first if you want one.",
    eraseConfirm: "Erase everything",
    eraseBusy: "Erasing…",
    eraseFailed: (detail: string) => `Couldn't erase the history (${detail}).`,
    eraseDone: "History erased.",

    newSession: "New session",

    pathLabel: "Certification path",
    statusPassed: "Passed",
    statusAttempted: "In progress",
    statusUntouched: "Not started",
    statusSoon: "Not built",

    noScore: "—",

    cardScoreLabel: "Best score",
    cardMeta: (attempts: number, last: string) =>
      attempts === 1 ? `1 attempt · ${last}` : `${attempts} attempts · ${last}`,
    cardMetaNone: "No attempts yet",

    cardMetaDrills: (attempts: number) =>
      attempts === 1 ? "1 drill · none counted" : `${attempts} drills · none counted`,

    historyTitle: "Attempt history",
    historyEmpty:
      "Nothing graded yet. Finish an attempt in Mastery or Exam mode and it lands here — Training runs are not recorded.",
    colExam: "Exam",
    colMode: "Mode",
    colDate: "Date",
    colTime: "Time",
    colScore: "Score",

    modeAllDomains: (mode: string) => `${mode} · all domains`,
    modeDomains: (mode: string, domains: string) => `${mode} · ${domains}`,
    domainSeparator: ", ",
    percent: (n: number) => `${n}%`,

    rowPassed: "pass",
    rowFailed: "no pass",

    uncounted: "drill",

    uncountedTitle: "A filtered or short draw. It shows here but does not count toward the path.",
    untimed: "untimed",

    weakTitle: "Weakest domains across all attempts",
    weakHint: "Points earned over points available, drills included — a domain drill is the best evidence you have about a weak domain.",
    weakEmpty: "Nothing to rank yet.",
    weakMeta: (attempts: number) =>
      attempts === 1 ? "from 1 attempt" : `from ${attempts} attempts`,

    drill: "Build a drill from these",

    drillSome: (n: number) => `Build a drill from ${n} of these`,
    weakNotHere: "not in the loaded exam",
    drillUnavailable: (exam: string) =>
      `These domains come from other exams. Load ${exam} to drill them.`,

    loadFailed: (detail: string) =>
      `Couldn't load your history (${detail}). It is served by the facilitator from its state volume; check it with \`docker compose ps facilitator\`.`,
    retry: "Retry",

    reviewRow: (exam: string, date: string) => `Review the ${exam} attempt from ${date}`,
  },

  hosted: {
    signInTitle: "Sign in to sit an exam",

    signInLead:
      "A hosted session gives you a real cluster for a few hours. Signing in is how your attempts stay yours — every graded exam is kept against your account, and it outlives the environment it was taken in.",
    signInGitHub: "Continue with GitHub",

    signInScope:
      "No permissions are requested. GitHub tells this app your username and nothing else; it cannot see your repositories.",

    signInSeats: (used: number, total: number) =>
      used >= total
        ? `All ${total} hands-on seats are in use right now — you can still join the queue.`
        : `${total - used} of ${total} hands-on seats free.`,
    signInSeatsMcq: (free: number) =>
      free > 0 ? `Multiple choice needs no cluster: ${free} seats free.` : "",

    signInUnavailable:
      "This deployment identifies you through the proxy in front of it, and that proxy did not say who you are. There is nothing to sign in to here.",

    signInLocal:
      "Prefer no caps and no queue? The whole thing runs on your own machine — clone the repository and run ./sim up.",

    startTitle: (login: string) => `Ready when you are, ${login}`,

    startLead:
      "Pick the exam you want to sit. A hands-on session builds you a real cluster and takes a few minutes to come up; multiple choice is ready immediately.",

    examFallbackBody: "A full sitting, graded the way the real exam is.",

    noExams: "This deployment has no seats configured, so there is nothing to start here yet.",

    practicalTitle: "Hands-on exam",
    practicalBody:
      "A real Kubernetes cluster, two shells and a desktop with a browser, in your own environment. This is the full simulator.",
    mcqTitle: "Multiple choice",
    mcqBody:
      "Answered in this browser. No cluster, no waiting, and it works on a phone.",
    seatsFree: (used: number, total: number) => `${total - used} of ${total} free`,
    seatsFull: (total: number) => `all ${total} in use`,
    start: "Start",

    startQueue: "Join the queue",
    starting: "Starting…",
    startFailed: (detail: string) => `Could not start a session: ${detail}`,

    queueTitle: "Every seat is taken",
    queueBody: (position: number) =>
      position === 1
        ? "You are next. The moment a seat is given up, yours starts building."
        : `You are number ${position} in the queue.`,

    queueHold:
      "Keep this page open. When a seat reaches you it is held briefly — if nothing claims it, it passes to the next person.",
    queueLeave: "Leave the queue",
    queueWait: "Wait here",

    bootPendingTitle: "Waiting for a slot",
    bootPendingBody:
      "Your seat is held. Environments are built one at a time — building two at once makes both slow rather than making either fast.",
    bootStartingTitle: "Building your environment",

    // `pooled` decides whether the boot may claim task setup at all. A pooled
    // bank draws its tasks when an attempt starts and seeds them then, so the
    // boot only pulls the cluster and the images — saying otherwise here is
    // what made the seed at start look like the same work happening twice.
    bootStartingBody: (nodes?: number, tasks?: number, pooled?: boolean) => {
      const cluster =
        nodes && nodes > 0
          ? `A ${nodes}-node Kubernetes cluster`
          : "A real Kubernetes cluster";
      const setup =
        !pooled && tasks && tasks > 0
          ? `, the exam images and ${tasks} tasks' worth of setup`
          : " and the exam images";
      const then = pooled ? " Your tasks are drawn and set up when you start an attempt." : "";
      return `${cluster}${setup}. Nothing is lost if you close this tab.${then}`;
    },
    bootStartingBodyMcq:
      "No cluster to build for a multiple-choice exam — just the question bank and the marker. This takes a few seconds.",
    bootElapsed: (elapsed: string) => `${elapsed} so far`,

    bootReassure: (elapsedMs: number) => {
      if (elapsedMs < 90_000) return "Pulling images and starting the cluster.";
      if (elapsedMs < 240_000) return "Still going — the cluster is coming up and the exam images are being pulled.";
      if (elapsedMs < 600_000)
        return "Taking longer than usual. A first build on a cold node pulls several gigabytes; it is still working.";
      return "This is well past the usual wait. If nothing changes, give up this seat and start again.";
    },
    bootFailedTitle: "Your environment did not start",
    bootRetry: "Try again",
    bootGiveUp: "Give up this seat",

    rebuildTitle: "Rebuilding your environment",

    rebuildBody: (exam?: string) =>
      exam
        ? `Your last attempt is being cleared and a clean ${exam} environment built in its place. This takes a few minutes, and nothing is lost if you close this tab.`
        : "Your last attempt is being cleared and a clean environment built in its place. This takes a few minutes, and nothing is lost if you close this tab.",

    rebuildGiveUp: "End session and free the seat",

    rebuildReassure: (elapsedMs: number) => {
      if (elapsedMs < 90_000) return "Tearing down the old cluster and starting a clean one.";
      if (elapsedMs < 240_000)
        return "Still going — the new cluster is coming up and its questions are being set up.";
      if (elapsedMs < 600_000)
        return "Taking longer than usual, but the images are already on this node — this is not a first build. Still working.";
      return "This is well past the usual wait, and something may be wrong. Ending the session frees the seat so you can start again.";
    },

    rebuildFailedTitle: "Your environment could not be rebuilt",

    chipLabel: "Session",
    chipTimeLeft: (left: string) => `${left} left`,

    chipEndingSoon: (left: string) => `Ends in ${left}`,
    chipExpired: "Session over",
    endSession: "End session",
    endConfirmTitle: "End this session?",

    endConfirmBody:
      "Your environment is destroyed and the seat goes back to the pool. Attempts you have already finished stay in your history — this only ends the environment.",
    endConfirm: "End session",
    endCancel: "Keep working",
    endFailed: (detail: string) => `Could not end your session: ${detail}`,
    signOut: "Sign out",
  },

  review: {
    back: "Progress",
    crumb: "Past attempt",
    loading: "Loading that attempt…",
    loadFailed: (detail: string) => `Couldn't load that attempt: ${detail}`,
    retry: "Retry",

    banner: (date: string) => `Sat on ${date}. This is a record, not a live session.`,
  },
} as const;
