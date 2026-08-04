package main

import (
	"os"
	"path/filepath"

	"kubestronaut-sim/facilitator/internal/evaluate"
	"kubestronaut-sim/facilitator/internal/exam"
)

// withSolutions returns a COPY of a graded document whose questions
// carry the bank's reference solution.
//
// It exists for one caller — the history mirror — and the copy is the
// point. A hosted attempt is read back weeks later, from a hub, long
// after the Pod that held the bank was deleted; without the solution
// travelling with it, a stored attempt can show a candidate every check
// they failed and nothing whatsoever about what passing looked like.
// Live, the same text is one fetch away from the bank on disk, so the
// running product asks for it instead and this function is not involved.
//
// Nothing here mutates res. The document it is handed is the one the
// session manager is serving on GET /api/results at that moment, and a
// solution written into it would be a solution served from it — see the
// note on evaluate.QuestionResult.Solution for why that door has to stay
// shut. Only the Questions slice is rebuilt; everything else is copied
// by value with the struct.
//
// A question whose solution.md cannot be read is skipped rather than
// failing the mirror: one unreadable file must not cost the candidate
// the whole attempt. The result is simply a stored question with no
// solution, which the review screen already renders — that is what every
// attempt stored before this existed looks like.
func withSolutions(res *evaluate.Results, ex *exam.Exam, bankDir string, logf func(string, ...any)) *evaluate.Results {
	if res == nil || bankDir == "" {
		return res
	}

	docs := map[string][]evaluate.Doc{}
	if ex != nil {
		for _, q := range ex.Questions {
			if len(q.Docs) == 0 {
				continue
			}
			list := make([]evaluate.Doc, 0, len(q.Docs))
			for _, d := range q.Docs {
				list = append(list, evaluate.Doc{Label: d.Label, URL: d.URL})
			}
			docs[q.ID] = list
		}
	}

	out := *res
	out.Questions = make([]evaluate.QuestionResult, len(res.Questions))
	copy(out.Questions, res.Questions)
	for i := range out.Questions {
		id := out.Questions[i].ID
		// filepath.Join cleans the path, so an id containing "../" cannot
		// climb out of the bank — but ids come from a bank the operator
		// installed, not from a request, so this is belt and braces.
		md, err := os.ReadFile(filepath.Join(bankDir, id, "solution.md"))
		if err != nil {
			logf("history mirror: no reference solution stored for %s: %v", id, err)
			continue
		}
		out.Questions[i].Solution = string(md)
		out.Questions[i].Docs = docs[id]
	}
	return &out
}
