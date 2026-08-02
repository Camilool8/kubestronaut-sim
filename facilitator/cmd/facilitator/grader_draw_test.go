package main

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"kubestronaut-sim/facilitator/internal/evaluate"
	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/session"
)

// Grading must REFUSE when the attempt's pool digest no longer describes
// the loaded bank.
//
// exam.Subset silently skips ids the exam does not declare, so a session
// whose drawn ids outlived their bank would otherwise be scored on the
// intersection: q02 vanishes from the bank, the attempt is graded on the
// two questions that remain, and the candidate reads a confident total
// for an exam they did not sit. A wrong score that looks right is worse
// than an error message.
func TestGradeRefusesWhenThePoolChangedUnderTheAttempt(t *testing.T) {
	drawn := mcqPooledTestExam()
	mgr, err := session.New(t.TempDir()+"/session.json", "test-bank", time.Hour, time.Now, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}
	if _, err := mgr.StartDraw(session.ModeExam, time.Hour, session.Draw{
		QuestionIDs: []string{"q01", "q02", "q03"},
		Seed:        "a1b2c3",
		PoolDigest:  exam.PoolDigest(drawn),
	}); err != nil {
		t.Fatalf("StartDraw: %v", err)
	}
	if err := mgr.SetAnswer("q01", []int{1}); err != nil {
		t.Fatalf("SetAnswer: %v", err)
	}
	if err := mgr.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}

	// The bank is edited under the running session: q02 retired.
	edited := *drawn
	edited.Questions = nil
	for _, q := range drawn.Questions {
		if q.ID != "q02" {
			edited.Questions = append(edited.Questions, q)
		}
	}

	g := newGrader(&edited, mgr, &countingRunner{}, time.Second)
	g.Grade()
	waitForGraded(t, mgr)

	raw, gradeErr, _ := mgr.Results()
	if len(raw) > 0 {
		t.Fatalf("results were recorded for an attempt that cannot be scored honestly: %s", raw)
	}
	if !strings.Contains(gradeErr, "changed") {
		t.Errorf("gradeError = %q, want it to say the bank changed", gradeErr)
	}
}

// The ordinary case still grades: a digest that matches is not a reason
// to refuse anything, and an attempt from before digests existed carries
// none and is not second-guessed.
func TestGradeProceedsWhenTheDigestMatchesOrIsAbsent(t *testing.T) {
	for _, tc := range []struct {
		name   string
		digest func(*exam.Exam) string
	}{
		{"matching digest", exam.PoolDigest},
		{"no digest at all", func(*exam.Exam) string { return "" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ex := mcqPooledTestExam()
			mgr, err := session.New(t.TempDir()+"/session.json", "test-bank", time.Hour, time.Now, func() {})
			if err != nil {
				t.Fatalf("session.New: %v", err)
			}
			if _, err := mgr.StartDraw(session.ModeExam, time.Hour, session.Draw{
				QuestionIDs: []string{"q01", "q03"},
				PoolDigest:  tc.digest(ex),
			}); err != nil {
				t.Fatalf("StartDraw: %v", err)
			}
			if err := mgr.End("submitted"); err != nil {
				t.Fatalf("End: %v", err)
			}

			g := newGrader(ex, mgr, &countingRunner{}, time.Second)
			g.Grade()
			waitForGraded(t, mgr)

			raw, gradeErr, _ := mgr.Results()
			if gradeErr != "" {
				t.Fatalf("gradeError = %q, want empty", gradeErr)
			}
			if len(raw) == 0 {
				t.Fatal("no results recorded")
			}
		})
	}
}

// A score has to be readable without the session that produced it —
// which is what an attempt history needs and what the results banner
// already wants. The attempt's mode, seed, filter and clock are copied
// onto the result, and each question carries the pair a pacing column
// compares: how long it was open, and how long it was meant to take.
func TestGradedResultsCarryTheAttemptAndItsTiming(t *testing.T) {
	ex := mcqPooledTestExam()
	ex.Duration = 30 * time.Minute // 3 questions of weight 1 => 600s each

	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	clock := func() time.Time { return now }
	mgr, err := session.New(t.TempDir()+"/session.json", "test-bank", time.Hour, clock, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}
	if _, err := mgr.StartDraw(session.ModeExam, time.Hour, session.Draw{
		QuestionIDs:  []string{"q01", "q03"},
		Seed:         "a1b2c3",
		PoolDigest:   exam.PoolDigest(ex),
		DomainFilter: []string{"Domain A"},
	}); err != nil {
		t.Fatalf("StartDraw: %v", err)
	}
	if err := mgr.Focus("q01"); err != nil {
		t.Fatalf("Focus: %v", err)
	}
	// Four minutes on q01, then the attempt is submitted from it — the
	// End that closes its still-open interval.
	now = now.Add(4 * time.Minute)
	if err := mgr.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}

	g := newGrader(ex, mgr, &countingRunner{}, time.Second)
	g.Grade()
	waitForGraded(t, mgr)

	raw, gradeErr, _ := mgr.Results()
	if gradeErr != "" {
		t.Fatalf("gradeError = %q", gradeErr)
	}
	var got evaluate.Results
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("unmarshal results: %v", err)
	}

	if got.Mode != session.ModeExam {
		t.Errorf("mode = %q, want exam", got.Mode)
	}
	if got.Seed != "a1b2c3" {
		t.Errorf("seed = %q, want a1b2c3", got.Seed)
	}
	if len(got.DomainFilter) != 1 || got.DomainFilter[0] != "Domain A" {
		t.Errorf("domainFilter = %v, want [Domain A]", got.DomainFilter)
	}
	if got.DurationSeconds != 3600 {
		t.Errorf("durationSeconds = %d, want the attempt's 3600", got.DurationSeconds)
	}
	if got.ElapsedSeconds != 240 {
		t.Errorf("elapsedSeconds = %d, want 240", got.ElapsedSeconds)
	}
	if len(got.Questions) != 2 {
		t.Fatalf("len(questions) = %d, want the drawn 2", len(got.Questions))
	}
	for _, q := range got.Questions {
		if q.TargetSeconds != 600 {
			t.Errorf("%s targetSeconds = %d, want 600 (a third of a 30-minute exam)", q.ID, q.TargetSeconds)
		}
	}
	// The 90-second cap applies per GAP between reports, and End closes
	// the last one — so four unbroken minutes on q01 is billed at 90s,
	// not at 240s and not at nothing.
	if got.Questions[0].TimeSpentSeconds != 90 {
		t.Errorf("q01 timeSpentSeconds = %d, want 90 (the per-gap cap)", got.Questions[0].TimeSpentSeconds)
	}
	if got.Questions[1].TimeSpentSeconds != 0 {
		t.Errorf("q03 timeSpentSeconds = %d, want 0 — it was never on screen", got.Questions[1].TimeSpentSeconds)
	}
}
