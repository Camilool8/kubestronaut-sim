package main

import "testing"

func TestNeedsGradeRecovery(t *testing.T) {
	cases := []struct {
		name       string
		state      string
		graded     bool
		gradeError string
		want       bool
	}{
		{"idle", "idle", false, "", false},
		{"running", "running", false, "", false},
		{"ended, not graded, no error: needs recovery", "ended", false, "", true},
		{"ended, graded with results", "ended", true, "", false},
		{"ended, graded via gradeError", "ended", true, "boom", false},
		{"idle but somehow marked graded (defensive)", "idle", true, "", false},
		{"running but somehow marked graded (defensive)", "running", true, "", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := needsGradeRecovery(c.state, c.graded, c.gradeError)
			if got != c.want {
				t.Errorf("needsGradeRecovery(%q, %v, %q) = %v, want %v",
					c.state, c.graded, c.gradeError, got, c.want)
			}
		})
	}
}
