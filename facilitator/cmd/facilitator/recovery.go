package main

func needsGradeRecovery(state string, graded bool, gradeError string) bool {
	return state == "ended" && !graded && gradeError == ""
}
