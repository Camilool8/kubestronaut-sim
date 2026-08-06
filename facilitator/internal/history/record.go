package history

import (
	"math"
	"sort"
	"time"

	"kubestronaut-sim/facilitator/internal/session"
)

type DomainResult struct {
	Domain string `json:"domain"`
	Earned int    `json:"earned"`
	Total  int    `json:"total"`

	WeightPct     float64 `json:"weightPct"`
	QuestionCount int     `json:"questionCount"`
}

type Record struct {
	ID            string `json:"id"`
	Bank          string `json:"bank"`
	Certification string `json:"certification,omitempty"`
	ExamTitle     string `json:"examTitle,omitempty"`
	ExamType      string `json:"examType"`
	Mode          string `json:"mode"`

	StartedAt    time.Time `json:"startedAt"`
	GradedAt     time.Time `json:"gradedAt"`
	Seed         string    `json:"seed,omitempty"`
	DomainFilter []string  `json:"domainFilter,omitempty"`

	DurationSeconds int `json:"durationSeconds,omitempty"`
	ElapsedSeconds  int `json:"elapsedSeconds,omitempty"`

	QuestionCount int  `json:"questionCount"`
	Earned        int  `json:"earned"`
	Total         int  `json:"total"`
	Percent       int  `json:"percent"`
	PointsPercent int  `json:"pointsPercent,omitempty"`
	PassingScore  int  `json:"passingScore"`
	Passed        bool `json:"passed"`

	Counted bool           `json:"counted"`
	Domains []DomainResult `json:"domains,omitempty"`
}

func Counted(mode string, domainFilter []string, questionCount, declared int) bool {
	if !session.Recorded(mode) {
		return false
	}
	if len(domainFilter) > 0 {
		return false
	}
	return declared <= 0 || questionCount >= declared
}

func (r Record) counts() bool {
	return r.Counted && session.Recorded(r.Mode) && len(r.DomainFilter) == 0
}

var kubestronautTrack = []string{"KCNA", "KCSA", "CKA", "CKAD", "CKS"}

type DomainSummary struct {
	Domain   string `json:"domain"`
	Earned   int    `json:"earned"`
	Total    int    `json:"total"`
	Percent  int    `json:"percent"`
	Attempts int    `json:"attempts"`
}

type ExamProgress struct {
	Attempts int `json:"attempts"`
	Counted  int `json:"counted"`

	BestPercent *int `json:"bestPercent,omitempty"`
	Passed      bool `json:"passed"`

	LastAttemptAt string          `json:"lastAttemptAt,omitempty"`
	WeakDomains   []DomainSummary `json:"weakDomains"`
}

type Summary struct {
	Attempts int `json:"attempts"`

	PassedCount int             `json:"passedCount"`
	TrackCount  int             `json:"trackCount"`
	WeakDomains []DomainSummary `json:"weakDomains"`
}

func (s *Store) Summary() Summary { return Summarize(s.All()) }

func (s *Store) ProgressByBank() map[string]ExamProgress {
	byBank := map[string][]Record{}
	for _, r := range s.All() {
		byBank[r.Bank] = append(byBank[r.Bank], r)
	}
	out := make(map[string]ExamProgress, len(byBank))
	for bank, records := range byBank {
		out[bank] = Progress(records)
	}
	return out
}

func Summarize(records []Record) Summary {
	sum := Summary{
		Attempts:    len(records),
		TrackCount:  len(kubestronautTrack),
		WeakDomains: weakDomains(records),
	}

	inTrack := make(map[string]bool, len(kubestronautTrack))
	for _, cert := range kubestronautTrack {
		inTrack[cert] = true
	}
	passed := map[string]bool{}
	for _, r := range records {
		if r.counts() && r.Passed && inTrack[r.Certification] {
			passed[r.Certification] = true
		}
	}
	sum.PassedCount = len(passed)
	return sum
}

func Progress(records []Record) ExamProgress {
	p := ExamProgress{
		Attempts:    len(records),
		WeakDomains: weakDomains(records),
	}
	var last time.Time
	for _, r := range records {
		if r.GradedAt.After(last) {
			last = r.GradedAt
		}
		if !r.counts() {
			continue
		}
		p.Counted++
		if r.Passed {
			p.Passed = true
		}
		if p.BestPercent == nil || r.Percent > *p.BestPercent {
			best := r.Percent
			p.BestPercent = &best
		}
	}
	if !last.IsZero() {
		p.LastAttemptAt = last.UTC().Format(time.RFC3339)
	}
	return p
}

func weakDomains(records []Record) []DomainSummary {
	type acc struct {
		earned, total, attempts int
	}
	totals := map[string]*acc{}
	order := []string{}
	for _, r := range records {
		for _, d := range r.Domains {
			a, ok := totals[d.Domain]
			if !ok {
				a = &acc{}
				totals[d.Domain] = a
				order = append(order, d.Domain)
			}
			a.earned += d.Earned
			a.total += d.Total
			a.attempts++
		}
	}

	out := make([]DomainSummary, 0, len(order))
	for _, name := range order {
		a := totals[name]

		if a.total <= 0 {
			continue
		}
		out = append(out, DomainSummary{
			Domain:   name,
			Earned:   a.earned,
			Total:    a.total,
			Percent:  int(math.Round(float64(a.earned) / float64(a.total) * 100)),
			Attempts: a.attempts,
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Percent == out[j].Percent {
			return out[i].Domain < out[j].Domain
		}
		return out[i].Percent < out[j].Percent
	})
	return out
}
