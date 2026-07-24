package exam

import (
	"testing"
	"time"
)

const (
	examJSON = "testdata/exam.json"
	bankDir  = "testdata/bank"
)

func TestLoad(t *testing.T) {
	e, err := Load(examJSON, bankDir)
	if err != nil {
		t.Fatalf("Load(%q, %q): %v", examJSON, bankDir, err)
	}

	if e.Name != "ckad-mock-01" {
		t.Errorf("Name = %q, want %q", e.Name, "ckad-mock-01")
	}
	if e.Title != "CKAD Mock Exam 01" {
		t.Errorf("Title = %q, want %q", e.Title, "CKAD Mock Exam 01")
	}
	if e.Duration != 2*time.Hour {
		t.Errorf("Duration = %v, want %v (spec.duration %q)", e.Duration, 2*time.Hour, "120m")
	}
	if e.PassingScore != 66 {
		t.Errorf("PassingScore = %d, want 66", e.PassingScore)
	}
	if e.KubernetesVersion != "1.35" {
		t.Errorf("KubernetesVersion = %q, want %q", e.KubernetesVersion, "1.35")
	}

	if len(e.Questions) != 2 {
		t.Fatalf("len(Questions) = %d, want 2", len(e.Questions))
	}

	// exam.json lists q02 before q01 — Questions must preserve that file
	// order, not sort by ID.
	q02, q01 := e.Questions[0], e.Questions[1]
	if q02.ID != "q02" {
		t.Errorf("Questions[0].ID = %q, want %q (file order not preserved)", q02.ID, "q02")
	}
	if q01.ID != "q01" {
		t.Errorf("Questions[1].ID = %q, want %q (file order not preserved)", q01.ID, "q01")
	}

	if q02.Instance != "ckad-1" {
		t.Errorf("q02.Instance = %q, want %q", q02.Instance, "ckad-1")
	}
	if q02.Domain != "Application Deployment" {
		t.Errorf("q02.Domain = %q, want %q", q02.Domain, "Application Deployment")
	}
	if q02.Weight != 7 {
		t.Errorf("q02.Weight = %d, want 7", q02.Weight)
	}
	if q01.Domain != "Application Environment, Configuration and Security" {
		t.Errorf("q01.Domain = %q, want comma preserved verbatim, got %q", q01.Domain, q01.Domain)
	}

	// q01/validate.d has two scripts; checks must be in lexical filename
	// order: 10_ok.sh before 20_bad-points.sh.
	if len(q01.Checks) != 2 {
		t.Fatalf("len(q01.Checks) = %d, want 2", len(q01.Checks))
	}
	ok, bad := q01.Checks[0], q01.Checks[1]

	if ok.Name != "10_ok.sh" {
		t.Errorf("q01.Checks[0].Name = %q, want %q", ok.Name, "10_ok.sh")
	}
	if ok.Points != 3 {
		t.Errorf("10_ok.sh Points = %d, want 3", ok.Points)
	}
	if ok.Desc != "x" {
		t.Errorf("10_ok.sh Desc = %q, want %q", ok.Desc, "x")
	}
	if ok.Skip {
		t.Errorf("10_ok.sh Skip = true, want false")
	}

	if bad.Name != "20_bad-points.sh" {
		t.Errorf("q01.Checks[1].Name = %q, want %q", bad.Name, "20_bad-points.sh")
	}
	if !bad.Skip {
		t.Errorf("20_bad-points.sh (# points: 08) Skip = false, want true (leading zero)")
	}
	if bad.Points != 0 {
		t.Errorf("20_bad-points.sh Points = %d, want 0 (skipped)", bad.Points)
	}
	wantDesc := "ratio 3:1 must hold, e.g. 3:1 not 1:3"
	if bad.Desc != wantDesc {
		t.Errorf("20_bad-points.sh Desc = %q, want %q (colons preserved verbatim)", bad.Desc, wantDesc)
	}

	// q02/validate.d has one script with no header at all.
	if len(q02.Checks) != 1 {
		t.Fatalf("len(q02.Checks) = %d, want 1", len(q02.Checks))
	}
	missing := q02.Checks[0]
	if missing.Name != "10_two.sh" {
		t.Errorf("q02.Checks[0].Name = %q, want %q", missing.Name, "10_two.sh")
	}
	if !missing.Skip {
		t.Errorf("10_two.sh (no header) Skip = false, want true")
	}
	if missing.Points != 0 {
		t.Errorf("10_two.sh Points = %d, want 0 (skipped)", missing.Points)
	}
}

func TestLoadUnknownExamPath(t *testing.T) {
	if _, err := Load("testdata/does-not-exist.json", bankDir); err == nil {
		t.Error("Load with unknown exam JSON path: got nil error, want non-nil")
	}
}

func TestParsePoints(t *testing.T) {
	cases := []struct {
		name       string
		raw        string
		present    bool
		wantPoints int
		wantSkip   bool
	}{
		{"valid", "3", true, 3, false},
		{"zero", "0", true, 0, false},
		{"leading zero", "08", true, 0, true},
		{"negative", "-1", true, 0, true},
		{"non-numeric", "abc", true, 0, true},
		{"empty value", "", true, 0, true},
		{"missing header", "", false, 0, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			points, skip := parsePoints(c.raw, c.present)
			if points != c.wantPoints || skip != c.wantSkip {
				t.Errorf("parsePoints(%q, %v) = (%d, %v), want (%d, %v)",
					c.raw, c.present, points, skip, c.wantPoints, c.wantSkip)
			}
		})
	}
}
