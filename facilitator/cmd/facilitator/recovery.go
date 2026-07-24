package main

// needsGradeRecovery reports whether a just-booted session needs the
// grader kicked once before the server starts accepting requests.
//
// This is the crash-recovery gap documented on session.New: its own
// load-time correction for a "running" session found already past
// expiry ends it immediately but deliberately does not fire onExpire
// (no live timer or Snapshot call actually observed that expiry
// happen). The same gap applies if a prior process crashed mid-grade —
// after End persisted "ended" but before SetResults/SetGradeError
// landed. Either way, an ended session whose grading never reached a
// terminal outcome (no results recorded and no gradeError set) needs
// the grader kicked explicitly, exactly once, at boot.
//
// graded and gradeError are both taken from session.Manager.Results,
// whose own contract is graded = len(results) > 0 || gradeError != "".
// The explicit gradeError == "" check below is therefore redundant
// with !graded in practice — but it's kept as a direct, defensive
// statement of the actual condition this function means to capture,
// rather than relying on a caller to know that invariant.
func needsGradeRecovery(state string, graded bool, gradeError string) bool {
	return state == "ended" && !graded && gradeError == ""
}
