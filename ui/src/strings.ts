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
    // The mcq counterpart of `tips`: no ssh, no desktop, no working
    // directories — none of those exist for a multiple-choice bank.
    tipsMcq: [
      "Answer in the question panel — pick an option and it saves immediately.",
      "Multi-select questions score all-or-nothing: every correct option, nothing else.",
      "You can change any answer until you submit or time runs out.",
      "The timer starts the moment you click Start and cannot be paused.",
    ],
    // The catalog and the exam summary are separate endpoints, so one can
    // fail while the other renders. Say which one, and that the button
    // below is the thing that will not work.
    examFailed: (detail: string) =>
      `Couldn't load this exam's summary (${detail}). The facilitator may still be starting — check it with \`docker compose ps facilitator\`.`,
    modeLegend: "How do you want to run this?",
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
    reviewMarked: (n: number) =>
      n === 1 ? "1 question is marked for review:" : `${n} questions are marked for review:`,
    // "Never opened" rather than "unanswered": the UI knows it rendered
    // the text, not whether the work was done.
    reviewUnseen: (n: number) =>
      n === 1 ? "1 question was never opened:" : `${n} questions were never opened:`,
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
    // Training counts up: there is no deadline, and a frozen 00:00 would
    // read as an attempt that had already run out.
    timeElapsed: (span: string) => `Time elapsed: ${span}`,
  },

  questionPanel: {
    regionLabel: "Questions",
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
    // Still takes the chord rather than hardcoding it, so there is one
    // place to change if the binding ever moves — but it is now the same
    // chord for every candidate on every platform.
    copiedToDesktop: (value: string, chord: string) => `Copied ${value} — paste with ${chord}`,
    copied: (value: string) => `Copied ${value}`,
    copyFailed: "Could not copy that value.",
  },

  markdown: {
    plainLanguage: "text",
    copyBlock: "Copy",
    copyBlockLabel: (language: string) => `Copy ${language} code block`,
    copiedBlockToDesktop: (chord: string) => `Copied to the exam desktop — paste with ${chord}.`,
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
        body: "Step through with ‹ and ›, or the [ and ] keys. Click the question number to see all of them at once and jump anywhere. The chip below names the instance to ssh into. Click any value in the text — a name, a label, an image tag, a path — to copy it, then paste in the desktop terminal.",
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

  modes: {
    exam: {
      label: "Exam",
      blurb: (mins: number) => `${mins} minutes. No hints, no solutions — the real thing.`,
    },
    training: {
      label: "Training",
      // Named as the accessibility answer as well as the study one:
      // a countdown that cannot be paused fails WCAG 2.2.1, and this is
      // the way out of it.
      blurb: () =>
        "Untimed. Hints and solutions on demand, and you can score your work without ending the attempt.",
    },
    speed: {
      label: "Speed",
      blurb: (mins: number) => `${mins} minutes — half the usual. No hints. For pacing practice.`,
    },
  },

  hints: {
    // "Hint 1 of 2" rather than a bare "Hint": knowing how many are left
    // is what makes taking the first one feel affordable.
    show: (tier: number, total: number) => `Show hint ${tier} of ${total}`,
    heading: (tier: number, total: number) => `Hint ${tier} of ${total}`,
    showSolution: "Show solution",
    reseed: "Reset this question",
    reseeding: "Resetting…",
    reseedTitle: "Reset this question?",
    // Said plainly: this is the one control in training mode that
    // destroys work, and "reset" is a word people click without reading.
    reseedBody:
      "This re-runs the question's setup, putting it back exactly as it started. Anything you have done for this question is discarded. Other questions are untouched.",
    reseedConfirm: "Reset it",
    reseedDone: "Question reset to its starting state.",
    reseedFailed: (detail: string) => `Couldn't reset that question (${detail}).`,
    examOnly: "Hints are available in Training mode.",
    failed: (detail: string) => `Couldn't load that hint (${detail}).`,
  },

  mcq: {
    regionLabel: "Question",
    selectOne: "Select one answer",
    selectAll: "Select all that apply",
    // Footer nav labels: short pagination wording, deliberately not the
    // header stepper's fuller "Previous/Next question" aria-labels — the
    // two controls do the same thing, and matching text would give a
    // screen reader (and a test query) two identically-named buttons.
    previous: "Previous",
    next: "Next",
    // The option letter is part of how people talk about mcq items
    // ("the answer is C"), so it is text, not decoration.
    optionLabel: (letter: string, text: string) => `${letter}. ${text}`,
    // The save failed and the selection on screen is NOT what the server
    // has. Louder than a generic toast: an unsaved answer scores zero.
    saveFailed: (detail: string) =>
      `Couldn't save that answer (${detail}) — it is not recorded. Pick it again to retry.`,
    // The attempt ended (timer, or a submit elsewhere) between the click
    // and the save; the screen is about to flip to the score on its own.
    saveConflict: "The attempt has ended — that last change wasn't recorded.",
    answered: "answered",
    unanswered: "unanswered",
    // Submit dialog: unlike the hands-on screen, here the UI genuinely
    // knows what is unanswered — the answers live server-side.
    reviewUnanswered: (n: number) =>
      n === 1 ? "1 question is unanswered:" : `${n} questions are unanswered:`,
    allAnswered: "Every question has an answer.",
    confirmBody: "This cannot be undone. Your answers are already saved; grading begins immediately.",
    // Training-mode per-question reveal. Same 403-backed gate as the
    // hands-on solution link, same wording family.
    checkAnswer: "Check answer",
    loadingAnswer: "Loading the explanation…",
    // Score review.
    yourAnswer: "Your answer",
    correctAnswer: "Correct answer",
    notAnswered: "Not answered",
    explanation: "Explanation",
    optionCorrectSelected: "correct — you selected it",
    optionCorrectMissed: "correct — you did not select it",
    optionWrongSelected: "your selection — incorrect",
  },

  practice: {
    scoreNow: "Score my work",
    scoring: "Scoring…",
    title: "Your work so far",
    // Said out loud because a mid-attempt score is the one number a
    // candidate is most likely to over-read.
    note: "Not recorded, and not your final score — this is where you stand right now.",
    close: "Close",
    failed: (detail: string) => `Couldn't score right now (${detail}).`,
  },

  clipboard: {
    title: "Clipboard",
    open: "Clipboard",
    // Shown when the browser refuses navigator.clipboard.readText —
    // always in Firefox, and in Chrome until the permission is granted.
    // Names the way out rather than the API that said no.
    blocked: "Your browser won't let this page read the clipboard. Use the Clipboard panel to send text to the desktop.",
    toDesktopLabel: "Send to the exam desktop",
    toDesktopHint: "Paste here, then Send. Useful for anything the desktop cannot read from your clipboard directly.",
    send: "Send",
    sent: "Sent to the exam desktop.",
    sendFailed: "No desktop connected.",
    fromDesktopLabel: "Copied on the exam desktop",
    // The desktop pushes its clipboard here on every explicit copy;
    // taking it into the host clipboard needs a click, because browsers
    // require a real gesture for a clipboard write.
    fromDesktopEmpty: "Nothing yet. Copy something in the exam terminal and it appears here.",
    copyToHost: "Copy",
    copiedToHost: "Copied to your clipboard.",
  },
  keyboard: {
    settingsLabel: "Keyboard",
    settingsTitle: "Keyboard",
    macToggle: "Translate Mac shortcuts",
    // Paste is deliberately absent from this list now: Ctrl+V and ⌘V both
    // paste on every platform whether or not this preference is on, so
    // naming it here would suggest it can be switched off.
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
    noneMac: "No shortcuts are being translated — this is not a Mac, or translation is switched off.",
  },
  boot: {
    title: "Building your exam environment",
    // Said plainly because the alternative is a candidate concluding it
    // has hung and killing it partway — which used to be the rational
    // read, since nothing on screen changed for the whole of a first run.
    hint: "First run builds a two-node Kubernetes cluster and sets up every question, which takes several minutes. Later runs resume in seconds. You can leave this tab open.",
    stepOf: (step: number, total: number, label: string) => `Step ${step} of ${total}: ${label}`,
    elapsed: (span: string) => `Elapsed ${span}`,
    progressLabel: "Environment build progress",
    failedTitle: "The exam environment failed to start",
    // Names the one command that shows the whole story. A candidate who
    // hits this needs the log, not reassurance.
    failedHint:
      "Nothing was lost — no attempt had started. `docker compose logs k8s-env` has the full output.",
    retry: "Try building again",
    // Shown when the browser can reach nothing at all, which during a
    // cold boot most likely means the container is still coming up.
    unreachable: "Waiting for the exam services to start…",
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
    // For jobs with no recreate-cluster phase (a switch to or reset of a
    // multiple-choice bank): promising minutes for a seconds-long job is
    // the same mistake in the other direction.
    hintFast: "Restarting the exam services. Usually a few seconds.",
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
    // Training has no deadline, so the urgency above would be a lie. The
    // counter beside this one counts up for the same reason.
    sessionRunningUntimed:
      "A training attempt is open. There is no time limit — pick it up on a desktop whenever you are ready, or submit it here.",
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
    domainTitle: "By curriculum domain",
    // The reason this section exists at all: a percentage says whether
    // you passed, this says what to study.
    domainHint: "Weakest first. This is where the next hour of study pays most.",
    domainColumn: "Domain",
    domainScore: "Score",
    domainUnknown: "Unclassified",
    modeNote: (mode: string) => `${mode} attempt — not a comparable exam result.`,
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
    reseed: "Reset this question",
    reseeding: "Resetting…",
    reseedTitle: "Reset this question?",
    // Said plainly: this is the one control in training mode that
    // destroys work, and "reset" is a word people click without reading.
    reseedBody:
      "This re-runs the question's setup, putting it back exactly as it started. Anything you have done for this question is discarded. Other questions are untouched.",
    reseedConfirm: "Reset it",
    reseedDone: "Question reset to its starting state.",
    reseedFailed: (detail: string) => `Couldn't reset that question (${detail}).`,
    loadingSolution: "Loading solution…",
  },
} as const;
