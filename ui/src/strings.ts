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

  header: {
    // Split so the header can grey the suffix: the product is
    // "kubestronaut", and "-sim" says it is the rehearsal, not the exam.
    wordmark: "kubestronaut",
    wordmarkTail: "-sim",
    navLabel: "Sections",
    backToExams: "Exams",
    // The crumb names where you are, in the words the screen itself
    // uses, so the header reads as one sentence with the page below it.
    crumbLobby: "Choose an exam",
    crumbResults: "Results",
  },

  // 1b, the exam selector. The screen a candidate lands on.
  exams: {
    title: "Path to Kubestronaut",
    lead: "Five certifications. Pick one to drill, or resume where you stopped.",
    // The capsule beside the title. It counts what you can SIT today, not
    // what you have passed — passing needs the attempt history, which
    // does not exist yet. When it does, the number changes meaning and
    // this label changes with it; the five segments are the same five
    // exams either way.
    coverageLabel: "Exams",
    coverage: (live: number, total: number) => `${live} of ${total} live`,
    live: "Live",
    soon: "Soon",
    unavailable: "Unavailable",
    liveListLabel: "Exams you can sit",
    soonListLabel: "Exams not built yet",
    // The stat strip under each card's title.
    durationLabel: "Duration",
    passingLabel: "To pass",
    engineLabel: "Engine",
    // Only for a pooled bank, where the two numbers genuinely differ.
    drawnLabel: "Drawn / pool",
    tasksLabel: "Tasks",
    questionsLabel: "Questions",
    enginePractical: "Practical",
    // "MCQ", not "Multiple choice": the strip's four cells are equal
    // width, and the longer phrase wrapped to two lines on the KCNA card
    // alone — which put that card's hairline 22px below CKAD's and made
    // two cards that should read as a matched pair look misaligned.
    // MCQ is also what the rest of this product calls it.
    engineMcq: "MCQ",
    engineUnknown: "Not built",
    // The card's primary action, on both the loaded exam and the others.
    // Deliberately identical wording: picking an exam is one act, and the
    // rebuild it may cost is the dialog's job to disclose, not a
    // different verb's.
    choose: "Choose a mode",
    // Expansions of the five certification acronyms. Copy, not data: they
    // are the same five strings for every bank that will ever carry them,
    // and a bank whose certification is not one of these falls back to
    // its own title.
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
    // The catalog answered with nothing at all. Distinct from a failure:
    // the request worked, so the fix is a missing mount, not a dead
    // container.
    empty: "No exams are installed. The banks directory is mounted read-only into the conductor; check it is not empty.",
  },

  // 1c, the mode selector. Everything on it is a promise the server
  // enforces — see the mode predicates in facilitator/internal/session.
  mode: {
    title: "How do you want to sit it?",
    lead: "Every mode uses the same tasks and the same grader. What changes is the clock and what you're allowed to lean on.",
    // The clock figure on a Training card. Not "0:00", which reads as an
    // attempt that already ran out.
    untimed: "No limit",
    // Beside a shortened clock, so half an exam is legible as half of
    // something. Said in words rather than drawn as a strikethrough —
    // a line through a number is a visual-only signal.
    fullClock: (full: string) => `${full} in the real exam`,
    recommended: "Recommended",
    // One row per server-enforced permission. Each is rendered with a
    // tick or a dash, and the sr-only word beside it is what carries the
    // state to a screen reader — the glyph is decoration.
    capHelp: "Hints and reference solutions",
    capGrade: "Grade your work without ending the attempt",
    capRecorded: "Kept as an attempt",
    capYes: "Yes:",
    capNo: "No:",
    capListLabel: "What this mode allows",
    start: (label: string) => `Start ${label}`,
    starting: "Starting…",
    // The draw panel. It describes the questions this exam asks; the
    // domain list is a summary today and becomes a filter in a later
    // milestone, so nothing in here is drawn as a control.
    drawTitle: "What you'll be asked",
    drawPooled: (drawn: number, pool: number) =>
      `${drawn} drawn at random from ${pool}, weighted to the published domain split. A different set every attempt.`,
    drawAll: (n: number) =>
      `All ${n}, every attempt. This bank has no larger pool behind it yet, so the set does not change between sessions.`,
    domainsPool: "Domains in the pool",
    domainsExam: "Domains in this exam",
    examFailed: (detail: string) =>
      `Couldn't load this exam (${detail}). The facilitator may still be starting; check it with \`docker compose ps facilitator\`.`,
    // The route named an exam that is not the loaded one — a stale
    // bookmark, or a switch that failed. Sending them back to the
    // selector is the only honest move: the modes on this screen would
    // start the OTHER exam.
    wrongExam: "That exam isn't loaded any more. Back to the exam list…",
    // Fine print for the attempt ahead. It sits after the mode cards, not
    // before them: it qualifies the act rather than gating it.
    tips: [
      "Solve questions over SSH on the named instance (user: candidate).",
      "The desktop's Firefox reaches allowlisted documentation sites only.",
      "Each question has a working directory pre-created at /opt/course/<n>.",
    ],
    // The mcq counterpart of `tips`: no ssh, no desktop, no working
    // directories — none of those exist for a multiple-choice bank.
    tipsMcq: [
      "Answer in the question panel: pick an option and it saves immediately.",
      "Multi-select questions score all-or-nothing: every correct option, nothing else.",
      "You can change any answer until you submit or time runs out.",
    ],
    // Every card is on screen at once now, so this is stated once for all
    // three rather than tracking a selection.
    tipTimer:
      "Training is untimed. Exam and Mastery start their clock the moment you start, and it cannot be paused.",
  },

  exam: {
    fallbackTitle: "Exam",
    loadingQuestions: "Loading the questions…",
    // An empty panel used to be the only symptom of this, which reads
    // exactly like an exam with no questions. Say which part broke, and
    // that the parts the clock depends on did not.
    questionsFailed: (detail: string) =>
      `Couldn't load the question list (${detail}). The timer and the exam desktop are unaffected. The questions are served by the facilitator, so check it is up with \`docker compose ps facilitator\`.`,
    // Mode-aware: Training's end control must not wear exam urgency.
    // Ending is equally final in both modes (one attempt record), but
    // what ends is different — an exam, or a practice session (#22).
    endAttempt: (mode: string) => (mode === "training" ? "End Training" : "End Exam"),
    ending: "Ending…",
    // Submitting is the one control that must never fail silently: the
    // server-side clock keeps running whatever the button looks like.
    endFailed: (detail: string) =>
      `Couldn't submit the exam (${detail}). The session is still running; try again, or submit from a desktop.`,
    confirmTitle: (mode: string) =>
      mode === "training" ? "End this training session?" : "End the exam?",
    reviewMarked: (n: number) =>
      n === 1 ? "1 question is marked for review:" : `${n} questions are marked for review:`,
    // "Never opened" rather than "unanswered": the UI knows it rendered
    // the text, not whether the work was done.
    reviewUnseen: (n: number) =>
      n === 1 ? "1 question was never opened:" : `${n} questions were never opened:`,
    confirmBody: (mode: string) =>
      mode === "training"
        ? "This ends the session for good; the desktop locks and your work is scored. A training score is feedback on where you stand, not an exam result."
        : "This cannot be undone. The desktop will lock immediately and grading will begin.",
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
      `Couldn't load this question (${detail}). The exam is still running; the desktop and the timer are unaffected.`,
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
    copiedToDesktop: (value: string, chord: string) => `Copied ${value}. Paste with ${chord}`,
    copied: (value: string) => `Copied ${value}`,
    copyFailed: "Could not copy that value.",
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
        body: "Step through with ‹ and ›, or the [ and ] keys. Click the question number to see all of them at once and jump anywhere. The chip below names the instance to ssh into. Click any value in the text (a name, a label, an image tag, a path) to copy it, then paste in the desktop terminal.",
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
        "One fixed set per exam; you will see the same questions again",
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
      "Typefaces: IBM Plex Sans and IBM Plex Mono in the app, JetBrains Mono on the exam desktop (SIL Open Font License)",
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
        ? `Desktop connection lost. Reconnecting, attempt ${attempt}.`
        : "Desktop connection lost. Reconnecting…",
    skip: "Skip past the exam desktop (it captures Tab while focused)",
  },

  // Choosing an exam that is not the loaded one is not a navigation — it
  // is a 2-4 minute destructive rebuild, and it stays behind a
  // confirmation for that reason alone.
  lobby: {
    switchConfirmTitle: (title: string) => `Load ${title}?`,
    switchConfirmBody:
      "Only one exam can be loaded at a time. Switching wipes all cluster and instance state and rebuilds from scratch, which usually takes about 2-4 minutes. You can leave the tab open while it runs.",
    switchConfirm: "Load it",
    cancel: "Cancel",
  },

  // The three attempt modes, gentlest first. `badge` is the mono tag the
  // mode card wears; `label` is the mode's name everywhere else.
  //
  // "Speed" is now "Mastery" per the design brief. Only the label moved
  // — the wire id stays `speed`, because renaming it would invalidate
  // every persisted session and every stored attempt.
  modes: {
    training: {
      label: "Training",
      badge: "LEARN",
      // Named as the accessibility answer as well as the study one:
      // a countdown that cannot be paused fails WCAG 2.2.1, and this is
      // the way out of it.
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
    // The candidate's own sequence position (1-65), never the bank's
    // internal question id (q61, q28, ...) — that id is an artifact of
    // a 97-question pool a random draw samples from, meaningless (and
    // non-sequential) to whoever is sitting the exam.
    questionNumber: (n: number) => `Q${n}`,
    // The option letter is part of how people talk about mcq items
    // ("the answer is C"), so it is text, not decoration.
    optionLabel: (letter: string, text: string) => `${letter}. ${text}`,
    // The save failed and the selection on screen is NOT what the server
    // has. Louder than a generic toast: an unsaved answer scores zero.
    saveFailed: (detail: string) =>
      `Couldn't save that answer (${detail}). It is not recorded; pick it again to retry.`,
    // The attempt ended (timer, or a submit elsewhere) between the click
    // and the save; the screen is about to flip to the score on its own.
    saveConflict: "The attempt has ended; that last change wasn't recorded.",
    answered: "answered",
    unanswered: "unanswered",
    // Submit dialog: unlike the hands-on screen, here the UI genuinely
    // knows what is unanswered — the answers live server-side.
    reviewUnanswered: (n: number) =>
      n === 1 ? "1 question is unanswered:" : `${n} questions are unanswered:`,
    allAnswered: "Every question has an answer.",
    confirmBody: (mode: string) =>
      mode === "training"
        ? "This ends the session for good; your answers are already saved. A training score is feedback on where you stand, not an exam result."
        : "This cannot be undone. Your answers are already saved; grading begins immediately.",
    // Training-mode per-question reveal. Same 403-backed gate as the
    // hands-on solution link, same wording family.
    checkAnswer: "Check answer",
    loadingAnswer: "Loading the explanation…",
    // Score review.
    yourAnswer: "Your answer",
    correctAnswer: "Correct answer",
    notAnswered: "Not answered",
    explanation: "Explanation",
    optionCorrectSelected: "correct, and you selected it",
    optionCorrectMissed: "correct, and you did not select it",
    optionWrongSelected: "your selection, incorrect",
    // The footer's running tally. Deliberately "completed", not a
    // position — the position badge lives in the header, and two
    // different numbers both claiming to locate the candidate was the
    // confusion this footer used to cause.
    answeredCount: (n: number, total: number) => `${n} / ${total} completed`,
  },

  practice: {
    scoreNow: "Score my work",
    scoring: "Scoring…",
    title: "Your work so far",
    // Said out loud because a mid-attempt score is the one number a
    // candidate is most likely to over-read.
    note: "Not recorded, and not your final score. This is where you stand right now.",
    close: "Close",
    failed: (detail: string) => `Couldn't score right now (${detail}).`,
    // One line per question. The label is the id on a hands-on exam and
    // the attempt position (Q3) on an mcq one, matching what the rest of
    // each screen calls the question.
    questionScore: (label: string, earned: number, total: number) => `${label}: ${earned}/${total}`,
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
    noneMac: "No shortcuts are being translated. This is not a Mac, or translation is switched off.",
    // The page's own shortcuts. Kept as copy rather than derived because
    // the handlers live in three different components (QuestionPanel,
    // PanelResizer, useFocusTrap) and there is no registry to read them
    // from — if one moves, this table has to move with it.
    browserShortcuts: [
      ["[  /  ]", "Previous / next question"],
      ["?", "This list"],
      ["Esc", "Close a panel or dialog"],
      ["← / →", "Resize the question panel (when the divider has focus)"],
      ["Shift + ← / →", "Resize in bigger steps"],
      ["Home / End", "Narrowest / widest panel"],
    ],
  },
  // What each translated Mac chord does on the exam desktop. Owned here,
  // read by lib/desktopKeymap.ts beside the chords themselves, rendered
  // by the shortcut-help table.
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
      "Nothing was lost: no attempt had started. `docker compose logs k8s-env` has the full output.",
    retry: "Try building again",
    // Shown when the browser can reach nothing at all, which during a
    // cold boot most likely means the container is still coming up.
    unreachable: "Waiting for the exam services to start…",
    // The phase checklist's labels, mirroring the `phase` calls in
    // images/k8s-env/{start,bootstrap}.sh. The ids stay in
    // BootProgress.tsx (they are protocol, not copy); the server's own
    // label wins for the running step if the two lists ever drift.
    phaseLabels: {
      dockerd: "Starting the container runtime",
      "helm-repo": "Publishing the local Helm repository",
      "create-cluster": "Creating the Kubernetes cluster",
      "api-server": "Waiting for the API server",
      cni: "Installing the pod network",
      ingress: "Installing the ingress controller",
      seed: "Setting up the exam questions",
      finalize: "Finishing up",
    },
  },
  control: {
    resetTitle: "Rebuilding your exam environment",
    // Takes the exam's catalog title ("CKA Mock Exam 01"), never the
    // bank slug — the slug is an implementation detail.
    switchTitle: (exam: string) => `Switching to ${exam}`,
    failedTitle: (op: string) => (op === "switch" ? "Switch failed" : "Reset failed"),
    // The measured cluster rebuild is 90–240s. Promising "1–2 minutes"
    // and then blowing past it turns a normal wait into a perceived hang.
    hint: "Rebuilding the Kubernetes cluster. Usually about 2-4 minutes. You can leave this tab open.",
    // For jobs with no recreate-cluster phase (a switch to or reset of a
    // multiple-choice bank): promising minutes for a seconds-long job is
    // the same mistake in the other direction.
    hintFast: "Restarting the exam services. Usually a few seconds.",
    stepOf: (step: number, total: number, label: string) =>
      `Step ${step} of ${total}: ${label}`,
    elapsed: (span: string) => `Elapsed ${span}`,
    reconnecting: "Restarting the exam services. The page will reconnect on its own.",
    // The pane behind this is the real command output the rebuild is
    // producing, not a synthesized progress number — a percentage here
    // would be invented, and the log is the honest alternative.
    showLog: "Show build log",
    logLabel: "Build log",
    logEmpty: "No output yet. The current phase has not printed anything.",
    logUnavailable: "The log pauses while the exam services restart.",
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
      `Couldn't reach the control plane (${detail}). The conductor container may be down; check it with \`docker compose ps conductor\`.`,
    newAttempt: "New attempt",
    newAttemptHint:
      "Wipes all cluster and instance state and returns you to the lobby, where you can retry this exam or pick a different one.",
  },

  mobile: {
    // Names the constraint instead of apologising for it, and says why
    // it is a real capability limit rather than a layout preference.
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
    sessionRunning:
      "An exam is running. The clock keeps going wherever you are; submit here if you cannot get to a desktop in time.",
    // Training has no deadline, so the urgency above would be a lie. The
    // counter beside this one counts up for the same reason.
    sessionRunningUntimed:
      "A training attempt is open. There is no time limit; pick it up on a desktop whenever you are ready, or submit it here.",
  },

  score: {
    gradingTitle: "Grading…",
    // "This can take a minute" was a guess, and the measured full 22-question
    // CKAD grade is ~16s. Overstating a wait is the same mistake as
    // understating one — the elapsed counter beside this is the honest
    // answer, so the copy only has to bound it and say not to navigate away.
    gradingBody:
      "Evaluating your exam over SSH. A full bank usually finishes in well under a minute; leave this tab open.",
    gradingFailedTitle: "Grading failed",
    retry: "Retry",
    // The poll could not reach the facilitator. Not terminal — the poll is
    // still running — so the copy says what is happening and that it will
    // keep trying, rather than reading like a dead end.
    pollFailed: (detail: string) =>
      `Still trying to reach the facilitator (${detail}). Retrying every few seconds; leave this tab open.`,
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
    // A skipped check never ran — its "# points:" header is malformed in
    // the bank — so rendering it like a failure would send the candidate
    // to study something the grader never measured. Say whose fault it is.
    checkSkippedMessage: "Not graded: this check's points header is malformed in the bank.",
    showSolution: "Show solution",
    loadingSolution: "Loading solution…",
  },
} as const;
