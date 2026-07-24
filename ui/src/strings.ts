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
      "The desktop's Firefox is for documentation only — no copy/paste answers.",
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
  },

  score: {
    gradingTitle: "Grading…",
    gradingBody: "Evaluating your exam over SSH. This can take a minute.",
    gradingFailedTitle: "Grading failed",
    retry: "Retry",
    pass: "PASS",
    fail: "FAIL",
    pointsDetail: (earned: number, total: number, passingScore: number) =>
      `${earned}/${total} points — passing score ${passingScore}%`,
    showSolution: "Show solution",
    loadingSolution: "Loading solution…",
  },
} as const;
