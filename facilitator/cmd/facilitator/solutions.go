package main

import (
	"os"
	"path/filepath"

	"kubestronaut-sim/facilitator/internal/evaluate"
	"kubestronaut-sim/facilitator/internal/exam"
)

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
