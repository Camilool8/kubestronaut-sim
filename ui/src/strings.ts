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
    crumbProgress: "Your path",
    // The header nav. Two entries, because there are two places to be
    // before an attempt starts and the dashboard is otherwise reachable
    // from nowhere.
    navExams: "Exams",
    navProgress: "Progress",
  },

  // 1b, the exam selector. The screen a candidate lands on.
  exams: {
    title: "Path to Kubestronaut",
    lead: "Five certifications. Pick one to drill, or resume where you stopped.",
    // The capsule beside the title. It counts certifications PASSED out of
    // the five on the path — `summary.passedCount` / `summary.trackCount`
    // from GET /api/catalog, the same pair the dashboard's path cards add
    // up to. It used to count what you could sit today, because nothing
    // recorded an attempt; the five segments are the same five exams
    // either way, and now they carry pass state rather than engine hue.
    coverageLabel: "Progress",
    coverage: (passed: number, total: number) => `${passed} of ${total} passed`,
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
    // The best-attempt bar, in the slot the bank's one-line pitch holds
    // until there is something to put there. Three readings rather than
    // one, because the middle case is the one that would look broken: a
    // card with three attempts none of which COUNTED (every one a drill or
    // a short draw) would otherwise print "3 attempts" beside a dash.
    bestLabel: (counted: number) =>
      counted === 1 ? "Best attempt · 1 session" : `Best attempt · ${counted} sessions`,
    // No date here, deliberately. `ExamProgress.lastAttemptAt` is the LAST
    // attempt, which on a passed exam need not be the one that passed —
    // printing it beside the word "Passed" would read as the pass date.
    // The dashboard's path card carries the date, where it means what it
    // says.
    bestPassed: (counted: number) =>
      counted === 1 ? "Passed · 1 session" : `Passed · ${counted} sessions`,
    bestDrills: (attempts: number) =>
      attempts === 1 ? "1 drill · none counted" : `${attempts} drills · none counted`,
    // A card with attempts but no counted one has no best score, and a
    // dash says that where 0% would claim a result.
    bestNoScore: "—",
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
    // The same button once the draw has been narrowed. One extra word,
    // carried at the point of the act rather than only in the panel below
    // — the chips are further down the page than the button is.
    startFiltered: (label: string) => `Start ${label} drill`,
    starting: "Starting…",
    // The draw panel. It describes the questions this exam asks, and its
    // domain list is now a real filter: POST /api/session/start takes
    // { mode, domains }, which the server has honoured since the
    // seeded-draw phase.
    drawTitle: "What you'll be asked",
    drawPooled: (drawn: number, pool: number) =>
      `${drawn} drawn at random from ${pool}, weighted to the published domain split. A different set every attempt.`,
    drawAll: (n: number) =>
      `All ${n}, every attempt. This bank has no larger pool behind it yet, so the set does not change between sessions.`,
    // The same sentence once the chips have narrowed it. Both of the
    // unfiltered readings above become false the moment a chip is pressed:
    // the count is no longer the whole bank, and "the set does not change
    // between sessions" is a claim about a draw nobody is taking.
    drawNarrowed: (drawn: number, pool: number, domains: number) =>
      `${drawn} of ${pool}, from the ${domains === 1 ? "domain" : `${domains} domains`} you picked.`,
    // The chip row's own heading, and the chip that clears the filter.
    chipsTitle: "Narrow the draw",
    chipsLabel: "Curriculum domains to draw from",
    allDomains: "All domains",
    // Said before the candidate starts, not after they see the result.
    // Two separate facts, and the second is the one that surprises people:
    // the run IS graded and IS kept, it just cannot be a pass. The results
    // banner refuses the word too (score.headlineFiltered), and the server
    // marks the record `counted: false`.
    filteredNote: (chosen: number, total: number) =>
      `Drawing from ${chosen} of ${total} domains. A narrowed draw is practice, not a sitting: it is graded and kept in your history, but it is never reported as a pass and it does not count toward your path.`,
    // The bank predates GET /api/exam's `domains`, so there is no honest
    // list to build chips from — counting `questions` would show whatever
    // the last draw happened to include as if it were the curriculum.
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
    // "Submit", not "End", per the design: ending describes only stopping,
    // where submitting describes what actually happens — the work goes for
    // grading and the desktop locks. The distinction matters most to the
    // candidate who thinks the button just pauses.
    //
    // Still mode-aware, which the design does not contradict so much as
    // never draw: it only ever shows an exam. Training's control must not
    // wear exam urgency, and calling a practice session an exam would be
    // the same lie in the other direction (#22).
    endAttempt: (mode: string) => (mode === "training" ? "Submit session" : "Submit exam"),
    ending: "Ending…",
    // Submitting is the one control that must never fail silently: the
    // server-side clock keeps running whatever the button looks like.
    endFailed: (detail: string) =>
      `Couldn't submit the exam (${detail}). The session is still running; try again, or submit from a desktop.`,
    // Same verb as the button that opened it. A dialog that asks "End the
    // exam?" after a click on "Submit exam" reads as a second, different
    // question.
    confirmTitle: (mode: string) =>
      mode === "training" ? "Submit this training session?" : "Submit the exam?",
    // "Task", not "question": this screen counts "Task 01 / 22", flags a
    // task, and opens "All tasks". The dialog was the last place still
    // calling them questions.
    reviewMarked: (n: number) =>
      n === 1 ? "1 task is marked for review:" : `${n} tasks are marked for review:`,
    // "Never opened" rather than "unanswered": the UI knows it rendered
    // the text, not whether the work was done.
    reviewUnseen: (n: number) =>
      n === 1 ? "1 task was never opened:" : `${n} tasks were never opened:`,
    // How a task is named in prose — the review lists above.
    //
    // A POSITION, never the bank id. The ids are an artifact of the draw
    // and appear nowhere else on this screen; listing "q02, q03" beside a
    // pane that says "Task 01 / 22" asks the candidate to map between two
    // numbering schemes to find the task they skipped. Today the two
    // happen to line up on an unpooled bank — once a hands-on draw is a
    // subset, they will not.
    taskNumber: (n: number) => `Task ${n}`,
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
    // The topbar's environment line: what machine the tasks are graded on
    // and what cluster is behind it. Both halves are facts the server
    // already sends (`kubernetesVersion`, and the instances the drawn
    // questions name) — an attempt with no ssh hosts (an mcq bank) drops
    // the second clause rather than printing an empty list.
    environment: (version: string, hosts: string) =>
      hosts
        ? `Kubernetes ${version} · ${hosts} reachable over ssh`
        : `Kubernetes ${version}`,
    // "opened", never "done" or "answered": this screen knows it rendered
    // the task's text and nothing more (components/marksStore.ts). The
    // bar beside it draws the same fraction and is aria-hidden.
    progress: (opened: number, total: number, flagged: number) =>
      flagged > 0
        ? `${opened} of ${total} opened · ${flagged} flagged`
        : `${opened} of ${total} opened`,
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
    // Never "answered" or "done": the UI knows it rendered the text, not
    // that the work was done, and the grader is the only thing that knows
    // the latter.
    mark: "Mark for review",
    points: (points: number) => `${points} pts`,
    sshHint: (instance: string) => `ssh ${instance}`,
    copyValue: (value: string) => `Copy ${value}`,
    // Still takes the chord rather than hardcoding it, so there is one
    // place to change if the binding ever moves — but it is now the same
    // chord for every candidate on every platform.
    copiedToDesktop: (value: string, chord: string) => `Copied ${value}. Paste with ${chord}`,
    copied: (value: string) => `Copied ${value}`,
    copyFailed: "Could not copy that value.",

    // ---- the task pane's identity block ----
    // Zero-padded to the width of the total, so the counter does not
    // change width between task 9 and task 10 under a running clock.
    taskCounter: (n: number, total: number) =>
      `Task ${String(n).padStart(String(total).length, "0")} / ${total}`,
    // The chord that flags the task you are reading. Drawn beside the
    // control it belongs to, the way the navigator's foot draws its own.
    markKey: "F",
    // This task's share of the exam's points, computed from the drawn
    // questions' weights — so on a randomly drawn attempt it is that
    // attempt's arithmetic, not the whole pool's. Rounded, with a floor
    // that never claims a graded task is worth nothing.
    weightShare: (pct: number) => `Weight ${pct < 1 ? "<1" : Math.round(pct)}%`,
    weightShareNote: (pct: number) =>
      `This task is worth ${pct < 1 ? "under 1" : Math.round(pct)}% of the exam's points.`,
    // A BUDGET, never a limit: nothing enforces it and running over costs
    // no points, so no wording here may imply a penalty. The clock it is
    // measured against is the attempt's, not the candidate's attention.
    targetTime: (span: string) => `Target ${span}`,
    targetTimeNote:
      "A pacing budget, not a limit. Nothing enforces it and running over costs no points.",
    // `targetDerived` means the figure is this task's weight's share of
    // the exam clock — arithmetic about weights, not anyone's judgement
    // of how long the work takes — and it has to say so.
    targetTimeDerived: (span: string) => `Target ≈${span}`,
    targetTimeDerivedNote:
      "Derived from this task's share of the exam clock, not a measured time. A pacing budget, not a limit — running over costs no points.",

    // ---- the machine block ----
    // The one surface in the task pane drawn in the --machine-* palette,
    // because it is literally a computer: the command, and where to run it.
    workFrom: "Work from",
    copyShort: "Copy",

    // The pane once carried two more paragraphs here: that kubectl needs no
    // context switch, and that grading reads the state you leave behind.
    // Both were true of every task in the bank, so both repeated 22 times
    // in a column the candidate is meant to read closely. They are exam
    // METHODOLOGY, and they moved to where methodology is explained once —
    // strings.intro, the "How this exam works" card.

    // ---- the footer nav ----
    // Short labels, because the row draws an arrow beside each. The full
    // "Previous question" / "Next question" above stays the accessible
    // name, which is allowed to be longer than the visible text as long as
    // it contains it (WCAG 2.5.3).
    prevShort: "Previous",
    nextShort: "Next",
    allTasks: "All tasks",
  },

  // The question navigator, shared by both exam engines — the hands-on
  // panel's full-panel disclosure and the multiple-choice screen's. One
  // component, so one namespace: these keys used to be split across
  // `questionPanel` and `mcq`, and the two copies had drifted.
  navigator: {
    // The trigger lives in each screen's nav header, but it is the
    // navigator's own control, so its copy is here. The accessible name
    // carries both where you are and what activating it does.
    open: "Show all questions",
    position: (n: number, total: number) => `Question ${n} of ${total}. Show all questions.`,
    regionLabel: "All questions",
    filterLabel: "Show",
    filterAll: "All",
    filterFlagged: "Flagged",
    // Two vocabularies for one state, because the two engines know
    // different things. The mcq screen holds the server's answer sheet, so
    // it can say whether a question is answered; the hands-on screen only
    // knows this tab rendered the text.
    filterUnseen: "Unseen",
    filterUnanswered: "Unanswered",
    legendCurrent: "Current",
    legendOpened: "Opened",
    legendAnswered: "Answered",
    legendFlagged: "Flagged",
    legendUnseen: "Unseen",
    legendUnanswered: "Unanswered",
    // Spoken, never drawn: ten tiles to a row leaves one line and it
    // belongs to the number.
    opened: "opened",
    unseen: "not opened",
    answered: "answered",
    unanswered: "unanswered",
    flagged: "flagged for review",
    // A filter matching nothing says which filter and what would fill it.
    emptyFlagged: "Nothing is flagged. Press F on a tile, or use Mark for review.",
    emptyUnseen: "Every question has been opened.",
    emptyUnanswered: "Every question has an answer.",
    // The shortcut strip. Keys first, then what they do, matching the
    // shortcut reference the ? key opens.
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

  intro: {
    title: "How this exam works",
    open: "How this exam works",
    done: "Got it",
    // The schematic is decorative to a sighted reader and load-bearing to
    // a screen reader, so it carries the same four regions in prose.
    schematicAlt:
      "Layout of the exam screen: a question panel on the left, the exam desktop filling the rest, and a bar across the top holding the countdown and the Submit exam button.",
    diagramQuestions: "Questions",
    diagramDesktop: "Exam desktop",
    diagramTimer: "1:59:58",
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
    // Deliberately NOT a fifth legend entry: the legend's numbers key to
    // the four regions drawn on the schematic above it, and grading is not
    // a region of the screen. It sits below, unnumbered.
    methodTitle: "How grading works",
    method:
      "Every task is scored by checks that read the state you leave behind — what is on the cluster and on the exam instances when grading runs, never the commands you typed. How you got there does not matter: a kubectl one-liner, an applied manifest and an edit in place all score the same. Each task's share of the exam is on the chip row beside its title.",
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

    // ---- the one-question screen ----
    // The counter above the stem. Zero-padding is deliberately absent
    // here: this column is 720px wide and nothing sits beside the counter
    // that a one-character width change would push around.
    questionCounter: (n: number, total: number) => `Question ${n} / ${total}`,
    // The topbar's running state of the whole attempt. Three numbers
    // because this screen genuinely knows all three: answers are server
    // state, flags and first-opens are this attempt's own scratch marks.
    tally: (answered: number, flagged: number, unseen: number) =>
      `Answered ${answered} · Flagged ${flagged} · Unseen ${unseen}`,
    // The footer's reassurance line. Both halves matter: every click is
    // already saved, and none of it has been marked yet.
    saveNote: "Answers save as you go · nothing is graded until submit",
    // The navigator trigger's short label; its accessible name is the
    // navigator's own "Question n of m. Show all questions."
    navigator: "Navigator",
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
    // the handlers live in four different components (QuestionPanel,
    // Navigator, PanelResizer, useFocusTrap) and there is no registry to
    // read them from — if one moves, this table has to move with it. The
    // navigator repeats its own four in a strip along its foot, where a
    // candidate is actually using them.
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
    // A pooled bank seeds only the questions the draw picked, so this runs
    // between pressing Start and the clock beginning. It destroys nothing,
    // and the wording has to say what is happening rather than borrow the
    // reset's — the candidate is waiting to sit an exam, not watching
    // their work be wiped.
    seedTitle: "Setting up your tasks",
    failedTitle: (op: string) =>
      op === "switch" ? "Switch failed" : op === "seed" ? "Setup failed" : "Reset failed",
    // The measured cluster rebuild is 90–240s. Promising "1–2 minutes"
    // and then blowing past it turns a normal wait into a perceived hang.
    hint: "Rebuilding the Kubernetes cluster. Usually about 2-4 minutes. You can leave this tab open.",
    // For jobs with no recreate-cluster phase (a switch to or reset of a
    // multiple-choice bank): promising minutes for a seconds-long job is
    // the same mistake in the other direction.
    hintFast: "Restarting the exam services. Usually a few seconds.",
    // The one thing worth saying while this runs: the clock is not going.
    // It is the question a candidate staring at a progress bar between
    // pressing Start and sitting the exam is actually asking.
    hintSeed:
      "Preparing the cluster for the tasks you drew. Your clock has not started and will not start until this finishes.",
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
    // A pooled bank prepares its cluster for the questions the draw
    // picked, and that can fail. The clock never started, so nothing was
    // lost — say that first, because a failure notice after pressing
    // Start otherwise reads as a lost attempt.
    prepareFailed: (detail: string) =>
      `The exam environment couldn't be set up, so the attempt never started and no time was used (${detail}). Try starting it again.`,
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
    // ---- the ink banner ----

    // The attempt's identity in one mono line: which bank, how it was run,
    // when it was graded, and the seed the draw came from. Everything
    // after the bank is optional, because a result graded before a field
    // existed is persisted verbatim and served back unchanged after an
    // upgrade — so the line is assembled from whatever actually arrived
    // rather than from a fixed shape with holes in it.
    eyebrowSeparator: " · ",
    listSeparator: ", ",
    runLabel: (mode: string) => `${mode} run`,
    // Split from its value because the eyebrow is set in caps and the seed
    // is not: the API's contract is six LOWERCASE hex digits, and a seed
    // shouted back in capitals is a seed a replay field can reject.
    drawSeedLabel: "draw seed",

    // The verdict is the headline, in words, with the threshold in it.
    // It used to be a bare percentage with PASS underneath — two halves of
    // one sentence in two type sizes, and the number the verdict was
    // measured against was nowhere on the banner at all.
    headlinePass: (percent: number, passing: number) =>
      `Passed — ${percent}% against a ${passing}% threshold`,
    headlineFail: (percent: number, passing: number) =>
      `Not passed — ${percent}% against a ${passing}% threshold`,
    // A draw narrowed to some domains did not cover the curriculum, so it
    // cannot be reported as a certification-style verdict however well it
    // went. Say what was drawn instead of implying a result it cannot
    // support.
    headlineFiltered: (percent: number) => `${percent}% on a filtered draw`,
    filteredNote: (domains: string) =>
      `This run drew only from ${domains}. It measures those domains, not the certification, so there is no pass or fail here.`,

    // The prose summary. Every sentence is conditional on the field it
    // reads being present; the paragraph is whatever survives.
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

    // The two-figure stat block beside the headline.
    statScore: "Weighted score",
    statTimeUsed: (clock: string) => `of ${clock} used`,
    statTimeOpen: "On the clock",
    statPoints: "Points earned",

    // The full-width bar and its scale. "pass 66%" is TEXT beside the gold
    // marker on purpose: the marker is a decorative token (--warn-marker
    // is below AA) and may never be the only thing carrying the threshold.
    meterFloor: "0%",
    meterCeiling: "100%",
    meterPass: (passing: number) => `pass ${passing}%`,

    pointsDetail: (earned: number, total: number, passingScore: number) =>
      `${earned}/${total} points (passing score ${passingScore}%)`,
    // Two percentages that differ with no explanation reads as a bug. The
    // weighted one decides the verdict; the raw one is what they scored.
    weightedNote: (raw: number) =>
      `Raw points come to ${raw}%. The weighted score counts each domain at its published curriculum share, and that is the figure the threshold is applied to.`,

    // ---- the sidebar ----

    domainTitle: "Domain breakdown",
    // The reason this section exists at all: a percentage says whether
    // you passed, this says what to study.
    domainHint:
      "Weighted to the published curriculum, weakest first — this is where the next hour of study pays most.",
    // The same section without a server-side rollup to weight it: an old
    // result, computed here from the questions alone. It must not claim a
    // weighting it did not do.
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
    // The non-colour carrier for a domain under the threshold. The tint
    // beside it is the second signal, never the first.
    domainBelow: "below threshold",
    domainUnknown: "Unclassified",

    // The card under the breakdown. It was prose for two milestones,
    // because a "drill these" button could only have started an ordinary
    // full-curriculum run — nothing in the UI could send a domain filter.
    // The mode screen's chips changed that, so the control is real now.
    nextTitle: "Next session",
    nextWeak: (domains: string) =>
      `Put the next study hour into ${domains}, then draw a fresh set.`,
    nextSolid: "Nothing fell below the threshold. Draw a fresh set and hold this pace.",
    nextDrill: "Drill these domains",
    // The wait is announced before it starts, not discovered during it: an
    // ended attempt has to be cleared before another can begin, and that
    // is a full environment rebuild.
    nextDrillHint:
      "Rebuilds the environment first, then opens the mode screen with these domains picked. A drill is not a sitting — it will not set a best score.",

    // ---- the task verdicts table ----

    verdictsTitle: "Task verdicts",
    // Two surfaces, said in one sentence. A row opens for the checks —
    // that is the comparison this table exists to let you make — and the
    // full explanation is where the reference solution and the captured
    // cluster state live. The row used to carry a solution of its own and
    // this line used to promise one; it does not any more.
    verdictsHint:
      "Open a row to read the grader's checks against each other. Open a task in full for its reference solution and whatever state its checks captured.",
    // The link out of an opened row and into the deep dive (1j). Numbered
    // rather than a bare "Open the full explanation" because twenty rows
    // produce twenty of these, and twenty links sharing one accessible
    // name is a list a screen-reader user cannot navigate.
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
    // Between the question directory and the domain on a row's meta line.
    // The same middle dot the banner eyebrow joins with, and spaced for
    // the same reason: it has to read as a separator to a screen reader
    // walking the line as one string, not weld two values together.
    metaSeparator: " · ",
    // The visible column strip is aria-hidden: this is a list of
    // disclosures, not a table, so nothing associates a header with a
    // cell. Each cell names itself instead.
    srWeight: "Weight",
    // "open", never "spent" or "worked" — the figure measures how long the
    // task pane was on screen and nothing more (api.ts).
    srTime: "Task pane open",
    srOverTarget: (over: string, target: string) => `${over} over the ${target} target`,
    overTarget: (over: string) => `+${over}`,
    verdictCorrect: "CORRECT",
    verdictPartial: "PARTIAL",
    verdictFailed: "FAILED",
    percentValue: (pct: number) => `${pct}%`,
    // A result graded before per-task timing existed has no time at all.
    // The column only appears when at least one row can fill it, so this
    // covers the mixed case, not the empty one.
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
    // A skipped check never ran — its "# points:" header is malformed in
    // the bank — so rendering it like a failure would send the candidate
    // to study something the grader never measured. Say whose fault it is.
    checkSkippedMessage: "Not graded: this check's points header is malformed in the bank.",
    // `showSolution` and `loadingSolution` used to live here, for a
    // disclosure inside every verdict row. The deep dive renders the same
    // solution eagerly and has the width for it, so the row's copy went
    // with the row's copy of the solution. (hints.showSolution is a
    // different string, on the training hint tray, and stays.)
  },

  // 1j, the explanation deep dive: one task, opened from a verdict row.
  //
  // Its centrepiece — two machine-surfaced documents side by side — is
  // the exception rather than the rule, and the copy has to hold up
  // without them. A check emits evidence only if its script asked to
  // (banks/_lib/checks.sh: show_actual / show_expected / show_why), and
  // today two of the twenty-two CKAD questions do. Every other task
  // arrives here with its check messages and its reference solution,
  // which is still more than the results row could show.
  explain: {
    // The mono eyebrow: position, domain and weight, in that order.
    eyebrowSeparator: " · ",
    // Zero-padded to the width of the total, for the same reason
    // questionPanel.taskCounter is: stepping from task 9 to task 10 must
    // not move the title underneath it.
    taskLabel: (n: number, total: number) =>
      `Task ${String(n).padStart(String(total).length, "0")}`,
    // The floor is questionPanel.weightShare's, and for its reason: a
    // graded task is never worth 0% of the exam, and rounding one down to
    // zero tells the candidate not to bother with it.
    weight: (pct: number) => `weight ${pct < 1 ? "<1" : Math.round(pct)}%`,
    // The two pills under the title. The verdict pill reuses
    // score.verdict*; this is the one beside it. "on this task" and never
    // "spent": the figure measures how long the task pane was open
    // (api.ts), which is not the same as attention.
    timing: (open: string) => `${open} on this task`,
    timingTarget: (open: string, target: string) => `${open} · target ${target}`,
    pointsLabel: "Points",
    // Prev/next move through the ATTEMPT's order, which is the order the
    // candidate sat them in — never bank order.
    prevTask: (n: number) => `Task ${n}`,
    nextTask: (n: number) => `Task ${n}`,
    prevLabel: "Previous task",
    nextLabel: "Next task",
    navLabel: "Step between tasks",
    backToResults: "All task verdicts",

    checksTitle: "Grader checks",
    // An mcq question has no validate.d checks at all; what it has is the
    // answer key beside what was selected.
    answerTitle: "Your answer",
    // A question the grader recorded with no checks — an empty validate.d,
    // or a result whose checks were dropped. The row above it already
    // showed the points; this says why there is nothing under them.
    checksNone: "The grader recorded no checks for this task.",

    // One heading over the whole captured-state section, and then one
    // sub-heading per check inside it. It used to be a mono eyebrow
    // repeated above every block, which said the same four words two or
    // three times on a task with several capturing checks. The plural is
    // the honest form of the same sentence, and each check keeps its own
    // description as a heading — q19's two checks capture a Service and an
    // EndpointSlice, and nothing here may invite reading them as one.
    evidenceTitle: (checks: number) =>
      checks === 1 ? "What this check saw" : "What these checks saw",
    // The panes. Titled as the brief titles them, because the distinction
    // they draw is the whole point: one is what the cluster had, the
    // other is what the check wanted.
    actualTitle: "Your cluster state",
    expectedTitle: "Expected",
    whyTitle: "Why this scored what it did",
    // The markers are ASCII "-" and "+" and not the typographic − and +:
    // @fontsource declares a unicode-range per face, and a codepoint
    // outside every range never reaches the woff2 (the same reason the
    // flag is drawn rather than typed). This legend is also the reason
    // the marks can carry the change on their own — the tint beside them
    // is the second channel, never the first.
    //
    // Drawn ONCE for the section, above the first comparison, and not
    // under every pane pair: it is a key to a notation, and a key repeated
    // three times on one screen stops being read the first time.
    diffLegend:
      "Lines marked - are in your state and not in the expected document; lines marked + are in the expected document and not in yours.",
    // Announced before a marked line, so the reading is not carried by a
    // gutter glyph a screen reader may skip as punctuation.
    lineChanged: "Differs:",
    // The two documents matched line for line. Worth saying: a check that
    // failed against an identical capture failed on something the capture
    // does not contain — a live endpoint, a status field k8s_clean strips.
    diffIdentical:
      "These two documents match line for line. Whatever the check measured is not visible in what it captured — the message above names it.",
    // The comparison was refused rather than attempted. See MAX_LINES in
    // lib/explainDiff.ts.
    diffTooLong:
      "These documents are too long to compare line by line, so neither pane is marked up. Both are shown in full.",
    // A single artifact with no counterpart — a check that showed what it
    // found but has no authored expected document, which is the common
    // shape.
    actualOnlyNote:
      "This is what the check read off the cluster. It has no authored counterpart to sit beside, so compare it against the reference solution below.",
    // The mirror image, and it means something specific: the check had an
    // authored document to compare against and captured nothing to
    // compare with. An empty capture is what an absent object looks like,
    // so saying "nothing was found" is more useful than an empty pane
    // labelled YOUR CLUSTER STATE beside a full one.
    expectedOnlyNote:
      "This is what the check was looking for. Nothing was captured from your cluster to sit beside it, which usually means the object does not exist yet.",

    // The task passed. There is genuinely nothing to explain, and
    // inventing a section for it would be worse than saying so.
    correctTitle: "Full marks on this task",
    correctBody:
      "Every check passed. The reference solution below is still worth a look — it is one way to get here, not the only one, and the grader scored the state you left rather than the route you took.",

    // No artifacts at all, which is most tasks today. Not an error and not
    // a gap in the result: it is what the bank's checks chose to emit.
    // The copy has to do two things at once — say that the absence is
    // normal, and point at what the candidate should read instead.
    noEvidenceTitle: "No captured state for this task",
    noEvidenceBody:
      "These checks report what they measured without keeping a copy of what they read, so there is nothing to set side by side. The messages above are the evidence — each one names the field it looked at and what it found there — and the reference solution below is the shape they were looking for.",

    solutionTitle: "Reference solution",
    solutionLoading: "Loading the reference solution…",
    solutionFailed: (detail: string) => `Couldn't load the reference solution (${detail}).`,

    // The upstream reading a bank author attached to this task
    // (`SolutionDetail.docs`). Most questions carry none, and the footer
    // is simply absent then — there is no empty state, because a footer
    // nobody was promised cannot read as missing.
    //
    // "Upstream" and not "Further reading": these point at kubernetes.io
    // and its neighbours, which is the documentation the real exam allows
    // — the word is the one that tells a candidate these are the pages
    // they may open on exam day.
    docsTitle: "Upstream documentation",
    // Appended to each link's accessible name. The visible channel is the
    // host printed beside the label: these open in a new tab, from the
    // candidate's own browser and not the exam desktop, so the reader is
    // told where they are going before they go.
    docsNewTab: "opens in a new tab",
    // The screen was deep-linked to a question that is not in this
    // attempt — a bookmark from an earlier draw, most likely. It is the
    // screen's h1, so it is written as a whole sentence.
    unknownTask: "That task isn't part of this attempt.",
  },

  // 1k, the progress dashboard. The first screen in this product that
  // looks across attempts rather than within one.
  progress: {
    title: "Your path",
    // The brief says "stored in this browser". It is not: history lives
    // server-side in the environment's state volume, which is why it
    // survives a reset, a bank switch and `./sim purge`. Saying where it
    // really is also says how to lose it.
    // No backticks: this is a plain string rendered as text, not markdown,
    // so a pair of them arrives on screen as a pair of them.
    lead: "Every attempt this environment has graded. Kept in its own volume rather than in this browser, so a reset, a bank switch and a purge all leave it where it is.",
    export: "Export",
    // Both hints describe a button, so both belong ON the button rather
    // than in the page flow. Rendered on this screen as the accessible
    // description of their control: as body copy they landed as one
    // run-on paragraph under the lead, a column away from either button,
    // reading as a single sentence that was true of neither.
    exportHint: "Downloads every attempt as a JSON file.",
    import: "Import",
    importHint: "Merges a previous export back in. Attempts already here are left alone.",
    importBusy: "Importing…",
    // The file picker itself. It is the one form control on this screen and
    // it is never the visible one: the button beside it opens it, so the
    // screen's control vocabulary stays buttons. The label is what a
    // screen reader announces for the input all the same.
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
    // The brief's primary action. Here it goes to the exam selector rather
    // than starting anything: an attempt begins on the mode screen, behind
    // a choice of exam and a choice of clock, and a button on the
    // dashboard that skipped both would be starting a session the
    // candidate never configured.
    newSession: "New session",

    // ---- the five path cards ----

    pathLabel: "Certification path",
    statusPassed: "Passed",
    statusAttempted: "In progress",
    statusUntouched: "Not started",
    statusSoon: "Not built",
    // The big figure on a card. A certification with no counted attempt
    // has no best score, and a dash says that better than 0%.
    noScore: "—",
    // What that figure IS. The card draws it as a bare number under an
    // acronym, which is legible on screen and says nothing at all read
    // aloud; this rides with it as .sr-only.
    cardScoreLabel: "Best score",
    cardMeta: (attempts: number, last: string) =>
      attempts === 1 ? `1 attempt · ${last}` : `${attempts} attempts · ${last}`,
    cardMetaNone: "No attempts yet",
    // Attempts that exist but none of which count toward the path —
    // every one was a drill or a short draw. The card would otherwise
    // read "3 attempts" beside a dash and look broken.
    cardMetaDrills: (attempts: number) =>
      attempts === 1 ? "1 drill · none counted" : `${attempts} drills · none counted`,

    // ---- the attempt table ----

    historyTitle: "Attempt history",
    historyEmpty:
      "Nothing graded yet. Finish an attempt in Mastery or Exam mode and it lands here — Training runs are not recorded.",
    colExam: "Exam",
    colMode: "Mode",
    colDate: "Date",
    colTime: "Time",
    colScore: "Score",
    // The mode cell: how it was run, and what it was run over. The domain
    // half is what separates two rows that would otherwise be identical —
    // a full sitting and a drill of one domain on the same day.
    modeAllDomains: (mode: string) => `${mode} · all domains`,
    modeDomains: (mode: string, domains: string) => `${mode} · ${domains}`,
    domainSeparator: ", ",
    percent: (n: number) => `${n}%`,
    // The marker under each row's figure. Colour is the second signal
    // here and never the first: a percentage on its own cannot say
    // whether it cleared a threshold that differs per exam, and three
    // tints with no words would be three tints.
    rowPassed: "pass",
    rowFailed: "no pass",
    // A drill or a short draw: real practice, but not a sitting. Marked
    // in the row rather than hidden, because hiding it would make the
    // week's work vanish.
    uncounted: "drill",
    // The footnote under the table, shown only when a row wears the mark.
    // A sentence under the table rather than a title= tooltip, which a
    // touch device never shows at all.
    uncountedTitle: "A filtered or short draw. It shows here but does not count toward the path.",
    untimed: "untimed",

    // ---- the weak-domain panel ----

    weakTitle: "Weakest domains across all attempts",
    weakHint: "Points earned over points available, drills included — a domain drill is the best evidence you have about a weak domain.",
    weakEmpty: "Nothing to rank yet.",
    weakMeta: (attempts: number) =>
      attempts === 1 ? "from 1 attempt" : `from ${attempts} attempts`,
    // The deep link into the mode screen with these domains preselected.
    // It only appears when it can actually do something: the domains have
    // to exist in the LOADED bank, because that is the only exam this
    // environment can start.
    drill: "Build a drill from these",
    // The rollup spans every certification attempted; only the loaded bank
    // can be drawn from. When the list above is a mix, the button counts
    // what it will actually take rather than claiming "these".
    drillSome: (n: number) => `Build a drill from ${n} of these`,
    weakNotHere: "not in the loaded exam",
    drillUnavailable: (exam: string) =>
      `These domains come from other exams. Load ${exam} to drill them.`,

    loadFailed: (detail: string) =>
      `Couldn't load your history (${detail}). It is served by the facilitator from its state volume; check it with \`docker compose ps facilitator\`.`,
    retry: "Retry",
  },
} as const;
