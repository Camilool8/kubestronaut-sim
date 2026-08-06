package main

import (
	"os"
	"path/filepath"
	"testing"

	"kubestronaut-sim/facilitator/internal/exam"
)

func bankWithSolutions(t *testing.T, ids ...string) string {
	t.Helper()
	dir := t.TempDir()
	for _, id := range ids {
		if err := os.MkdirAll(filepath.Join(dir, id), 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", id, err)
		}
		body := "# " + id + "\n\nRun `kubectl apply -f " + id + ".yaml`.\n"
		if err := os.WriteFile(filepath.Join(dir, id, "solution.md"), []byte(body), 0o644); err != nil {
			t.Fatalf("write %s: %v", id, err)
		}
	}
	return dir
}

func quiet(string, ...any) {}

func TestStoredAttemptsCarryTheReferenceSolution(t *testing.T) {
	dir := bankWithSolutions(t, "q01", "q02")

	got := withSolutions(gradedResults(), recorderExam(), dir, quiet)

	if len(got.Questions) != 2 {
		t.Fatalf("Questions = %d, want 2", len(got.Questions))
	}
	for _, q := range got.Questions {
		want := "# " + q.ID + "\n\nRun `kubectl apply -f " + q.ID + ".yaml`.\n"
		if q.Solution != want {
			t.Errorf("%s solution = %q, want %q", q.ID, q.Solution, want)
		}
	}
}

func TestEnrichingLeavesTheLiveDocumentAlone(t *testing.T) {
	dir := bankWithSolutions(t, "q01", "q02")
	live := gradedResults()

	got := withSolutions(live, recorderExam(), dir, quiet)

	for _, q := range live.Questions {
		if q.Solution != "" {
			t.Errorf("live %s carries a solution: %q", q.ID, q.Solution)
		}
	}
	if &got.Questions[0] == &live.Questions[0] {
		t.Error("the copy shares its Questions backing array with the live document")
	}
	if got.Bank != live.Bank || got.Earned != live.Earned || got.Percent != live.Percent {
		t.Error("the copy did not carry the rest of the document over")
	}
}

func TestStoredAttemptsCarryTheQuestionDocs(t *testing.T) {
	dir := bankWithSolutions(t, "q01", "q02")
	ex := recorderExam()
	ex.Questions[0].Docs = []exam.Doc{{Label: "Ingress path types", URL: "https://kubernetes.io/docs/x"}}

	got := withSolutions(gradedResults(), ex, dir, quiet)

	first := got.Questions[0]
	if first.ID != ex.Questions[0].ID {
		t.Fatalf("first question = %s, want %s", first.ID, ex.Questions[0].ID)
	}
	if len(first.Docs) != 1 || first.Docs[0].URL != "https://kubernetes.io/docs/x" {
		t.Errorf("Docs = %+v", first.Docs)
	}
	if len(got.Questions[1].Docs) != 0 {
		t.Errorf("q02 gained docs it never declared: %+v", got.Questions[1].Docs)
	}
}

func TestAMissingSolutionFileDoesNotLoseTheAttempt(t *testing.T) {
	dir := bankWithSolutions(t, "q01")

	got := withSolutions(gradedResults(), recorderExam(), dir, quiet)

	if len(got.Questions) != 2 {
		t.Fatalf("Questions = %d, want 2", len(got.Questions))
	}
	if got.Questions[0].Solution == "" {
		t.Error("q01 lost its solution because q02 had none")
	}
	if got.Questions[1].Solution != "" {
		t.Errorf("q02 solution = %q, want empty", got.Questions[1].Solution)
	}
}

func TestEnrichingIsANoOpWithoutABank(t *testing.T) {
	live := gradedResults()
	if got := withSolutions(live, recorderExam(), "", quiet); got != live {
		t.Error("withSolutions copied the document with no bank dir to read")
	}
	if got := withSolutions(nil, recorderExam(), "/nope", quiet); got != nil {
		t.Errorf("withSolutions(nil) = %+v, want nil", got)
	}
}
