package store

import (
	"encoding/json"
	"math"
	"sort"
	"time"
)

var track = []string{"KCNA", "KCSA", "CKA", "CKAD", "CKS"}

const modeTraining = "training"

type attempt struct {
	Bank          string          `json:"bank"`
	Certification string          `json:"certification"`
	Mode          string          `json:"mode"`
	DomainFilter  []string        `json:"domainFilter"`
	GradedAt      time.Time       `json:"gradedAt"`
	Percent       int             `json:"percent"`
	Passed        bool            `json:"passed"`
	Counted       bool            `json:"counted"`
	Domains       []DomainSummary `json:"domains"`
}

func (a attempt) counts() bool {
	return a.Counted && a.Mode != modeTraining && len(a.DomainFilter) == 0
}

type DomainSummary struct {
	Domain   string `json:"domain"`
	Earned   int    `json:"earned"`
	Total    int    `json:"total"`
	Percent  int    `json:"percent"`
	Attempts int    `json:"attempts"`
}

type Summary struct {
	Attempts int `json:"attempts"`

	PassedCount int             `json:"passedCount"`
	TrackCount  int             `json:"trackCount"`
	WeakDomains []DomainSummary `json:"weakDomains"`
}

func summarize(records []json.RawMessage) Summary {
	parsed := decodeAll(records)
	sum := Summary{
		Attempts:    len(records),
		TrackCount:  len(track),
		WeakDomains: weakDomains(parsed),
	}
	inTrack := map[string]bool{}
	for _, cert := range track {
		inTrack[cert] = true
	}
	passed := map[string]bool{}
	for _, a := range parsed {
		if a.counts() && a.Passed && inTrack[a.Certification] {
			passed[a.Certification] = true
		}
	}
	sum.PassedCount = len(passed)
	return sum
}

func decodeAll(records []json.RawMessage) []attempt {
	out := make([]attempt, 0, len(records))
	for _, raw := range records {
		var a attempt
		if err := json.Unmarshal(raw, &a); err != nil {
			continue
		}
		out = append(out, a)
	}
	return out
}

func weakDomains(attempts []attempt) []DomainSummary {
	type acc struct{ earned, total, attempts int }
	totals := map[string]*acc{}
	var order []string
	for _, a := range attempts {
		for _, d := range a.Domains {
			t, ok := totals[d.Domain]
			if !ok {
				t = &acc{}
				totals[d.Domain] = t
				order = append(order, d.Domain)
			}
			t.earned += d.Earned
			t.total += d.Total
			t.attempts++
		}
	}

	out := make([]DomainSummary, 0, len(order))
	for _, name := range order {
		t := totals[name]

		if t.total <= 0 {
			continue
		}
		out = append(out, DomainSummary{
			Domain:   name,
			Earned:   t.earned,
			Total:    t.total,
			Percent:  int(math.Round(float64(t.earned) / float64(t.total) * 100)),
			Attempts: t.attempts,
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
