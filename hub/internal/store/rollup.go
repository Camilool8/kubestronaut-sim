package store

import (
	"encoding/json"
	"math"
	"sort"
	"time"
)

// The cross-attempt rollup: the four numbers and the weak-domain ranking
// that GET /api/history carries beside the attempts.
//
// This is a deliberate mirror of facilitator/internal/history's
// Summarize, and it is worth being explicit about why it is a copy.
//
// The hub is a separate Go module. Every module here is stdlib-only with
// no go.sum, and `history` is an internal package of the facilitator's
// module — internal is scoped to that module's tree, so it cannot be
// imported from here whatever the go.mod says. Lifting it out of
// internal would couple the hub's build to the facilitator's for one
// function, and the hub's image copies hub/ alone.
//
// So: mirrored, narrowly. Only the fields this rollup reads are decoded
// out of each record — the rest stays raw bytes exactly as it does in
// Add, so a field added over there still reaches the browser untouched.
// If the two ever disagree the symptom is a hosted dashboard whose
// numbers differ from a local one, which is why the parts most likely to
// drift (which modes count, which certifications the path holds) are
// stated here rather than inferred.

// track is the certification path this product is named after.
//
// A constant of the PROGRAM, not of the banks a deployment ships: the
// denominator of "3 of 5" must not shrink because a bank is missing.
var track = []string{"KCNA", "KCSA", "CKA", "CKAD", "CKS"}

// modeTraining is the one mode that is graded but not counted. Training
// lets the candidate read the solutions while they work, so a training
// score is not a sitting.
const modeTraining = "training"

// attempt is the part of a record this rollup reads. Everything else in
// the record is passed through as bytes.
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

// counts re-derives the record's own `counted` flag from the two clauses
// a record can verify about itself, exactly as the facilitator's rollup
// does. The third clause — that the draw covered the bank's declared
// length — cannot be checked without that bank loaded, and a record's
// whole point is being readable without it.
func (a attempt) counts() bool {
	return a.Counted && a.Mode != modeTraining && len(a.DomainFilter) == 0
}

// DomainSummary is one domain rolled up across attempts. Percent is raw
// points earned over points available, never the curriculum-weighted
// figure: this ranks a candidate's domains against each other, and how
// heavily the exam board weights a domain is not part of that question.
type DomainSummary struct {
	Domain   string `json:"domain"`
	Earned   int    `json:"earned"`
	Total    int    `json:"total"`
	Percent  int    `json:"percent"`
	Attempts int    `json:"attempts"`
}

// Summary is the whole record in four numbers.
type Summary struct {
	Attempts int `json:"attempts"`
	// PassedCount counts distinct TRACK certifications with a counted,
	// passing attempt; TrackCount is how many the path holds. Restricting
	// the numerator to the track is what keeps "3 of 5" from reading
	// "6 of 5" once a bank outside the path exists.
	PassedCount int             `json:"passedCount"`
	TrackCount  int             `json:"trackCount"`
	WeakDomains []DomainSummary `json:"weakDomains"`
}

// summarize rolls a user's raw records up.
//
// A record that will not decode is counted and otherwise skipped rather
// than failing the request: it was written by a build of the facilitator
// this one has never met, and one unreadable attempt must not cost the
// candidate the rest of their history.
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

// weakDomains ranks every domain the candidate has been graded on,
// weakest first.
//
// Over EVERY attempt, not only the counted ones: "which domains am I
// weak in" is a different question from "does this count as a sitting",
// and a drill is the most informative thing a candidate can do about a
// weak domain. A rollup that ignored drills would keep reporting the
// weakness they spent all week fixing.
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
	// Never nil: the wire contract types this as an array, and a null is
	// a crash in every caller that maps over it.
	out := make([]DomainSummary, 0, len(order))
	for _, name := range order {
		t := totals[name]
		// A domain worth no points is an authoring artefact — every check
		// skipped — not a signal about the candidate.
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
