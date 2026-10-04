package main

import (
	"testing"

	"kubestronaut-sim/facilitator/internal/exam"
)

// The facilitator boots without an exam whenever no bank is selected —
// the lobby state. That path must not touch the exam.
func TestSessionOptionsWithNoExamLoaded(t *testing.T) {
	if got := sessionOptions(nil); len(got) != 0 {
		t.Fatalf("sessionOptions(nil) = %d options, want none", len(got))
	}
	// And the helpers the option would call are safe on a nil exam too.
	var ex *exam.Exam
	if ex.Languages() != nil || ex.BaseLanguage() != exam.DefaultLanguage || !ex.HasLanguage("") || ex.HasLanguage("pt") {
		t.Fatal("language helpers misbehave on a nil exam")
	}
}

func TestSessionOptionsWithAnExamLoaded(t *testing.T) {
	ex := &exam.Exam{Language: "en", Translations: []string{"pt"}}
	if got := sessionOptions(ex); len(got) != 1 {
		t.Fatalf("sessionOptions(ex) = %d options, want 1", len(got))
	}
}
