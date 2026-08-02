package history

import (
	"math"
	"sort"
	"time"

	"kubestronaut-sim/facilitator/internal/session"
)

// DomainResult is one curriculum domain's slice of a graded attempt, as
// the grader rolled it up at the time.
//
// Declared here rather than reused from the evaluate package on purpose:
// a record is frozen at the moment it is written, and its shape is the
// wire contract in ui/src/api.ts, not the grader's current internals. A
// change to how grading reports domains must not silently rewrite what a
// two-month-old attempt claims to have measured.
type DomainResult struct {
	Domain string `json:"domain"`
	Earned int    `json:"earned"`
	Total  int    `json:"total"`
	// WeightPct is the domain's share of the attempt's weighted Percent,
	// renormalized over the domains that attempt covered. Kept because it
	// explains the attempt's own score; it is deliberately NOT what the
	// cross-attempt rollup below ranks on.
	WeightPct     float64 `json:"weightPct"`
	QuestionCount int     `json:"questionCount"`
}

// Record is one graded attempt, kept forever.
//
// Deliberately SELF-CONTAINED: the certification, exam title, passing
// score and domain rollup are copied in, never referenced. The dashboard
// shows five certifications while only one bank is loadable at a time,
// so a record that pointed at its bank for the details would render as
// blanks for every exam except the current one.
type Record struct {
	// ID is the session's own attempt token. Reusing it rather than
	// minting a new one is what makes recording idempotent: a recovery
	// re-grade of the same attempt updates nothing.
	ID            string `json:"id"`
	Bank          string `json:"bank"`
	Certification string `json:"certification,omitempty"`
	ExamTitle     string `json:"examTitle,omitempty"`
	ExamType      string `json:"examType"`
	Mode          string `json:"mode"`
	// Both timestamps marshal as RFC3339, which is what the wire contract
	// types as a string and what every other timestamp in this API is.
	StartedAt    time.Time `json:"startedAt"`
	GradedAt     time.Time `json:"gradedAt"`
	Seed         string    `json:"seed,omitempty"`
	DomainFilter []string  `json:"domainFilter,omitempty"`
	// DurationSeconds is the attempt's clock (absent for an untimed one)
	// and ElapsedSeconds what was used of it.
	DurationSeconds int `json:"durationSeconds,omitempty"`
	ElapsedSeconds  int `json:"elapsedSeconds,omitempty"`
	// QuestionCount is how many questions this attempt was graded on, not
	// how many the bank holds — the two differ for a pooled draw and for
	// a domain-filtered one, and the difference is exactly what Counted
	// tests.
	QuestionCount int  `json:"questionCount"`
	Earned        int  `json:"earned"`
	Total         int  `json:"total"`
	Percent       int  `json:"percent"`
	PointsPercent int  `json:"pointsPercent,omitempty"`
	PassingScore  int  `json:"passingScore"`
	Passed        bool `json:"passed"`
	// Counted is whether this attempt may contribute to an exam's best
	// score and passed flag. See the Counted function for the rule.
	Counted bool           `json:"counted"`
	Domains []DomainResult `json:"domains,omitempty"`
}

// Counted reports whether an attempt of this shape may contribute to an
// exam's bestPercent and passed.
//
// Three clauses, and each one is a way the dashboard could otherwise
// lie:
//
//   - The mode must be a recorded one. Training is deliberate practice
//     with the hints and the solution open; it is not a sitting. (Only
//     recorded attempts are written at all, so on the recording path
//     this clause never fires. It earns its place on the READ path — see
//     Record.counts.)
//   - The draw must cover the whole curriculum. 100% on a ten-task drill
//     of one domain is a good session, but it is not a CKAD pass, and
//     letting it light up the certification path would be the dashboard
//     stating something untrue.
//   - The draw must be full length. A short draw is the same problem by
//     another route: fewer questions is an easier exam, and a bank's
//     passing score was set against its declared length.
//
// declared is the bank's declared exam length — ExamLength for a pooled
// bank, the size of the whole pool otherwise. Passing 0 for it (a caller
// that genuinely does not know) disables only the length clause.
func Counted(mode string, domainFilter []string, questionCount, declared int) bool {
	if !session.Recorded(mode) {
		return false
	}
	if len(domainFilter) > 0 {
		return false
	}
	return declared <= 0 || questionCount >= declared
}

// counts is Counted re-derived at READ time, from the record alone.
//
// A record's Counted flag is written once and then trusted — except that
// an IMPORTED record was written by a document this build did not
// produce, and can claim anything. So every rollup re-checks the two
// clauses a record can verify about ITSELF: its mode and its domain
// filter. The third clause cannot be re-checked here and is deliberately
// not attempted: a record's bank may not be the loaded one (that is the
// whole point of a self-contained record), so this process has no
// truthful way to know that bank's declared length.
//
// Belt and braces rather than rewriting the record on import: the
// document a candidate hands back is theirs, and a rollup that cannot be
// fooled beats a store that silently edits what it was given.
func (r Record) counts() bool {
	return r.Counted && session.Recorded(r.Mode) && len(r.DomainFilter) == 0
}

// kubestronautTrack is the certification path this product is named
// after: the five CNCF certifications that make someone a Kubestronaut.
//
// A constant of the PROGRAM, not of the banks this build happens to
// ship. Deriving it from the catalog was the obvious alternative and is
// wrong twice over: the denominator would shrink to 1 whenever the
// conductor is unreachable, and a candidate who had passed CKAD would be
// told "1 of 1" — that they are a Kubestronaut — by a dashboard that had
// simply lost sight of the other four.
var kubestronautTrack = []string{"KCNA", "KCSA", "CKA", "CKAD", "CKS"}

// DomainSummary is one domain's standing rolled up ACROSS attempts.
//
// Percent is raw points earned over points available, never the
// curriculum-weighted figure: this ranks a candidate's own domains
// against each other, and how much the exam board weights a domain is
// not part of that question.
type DomainSummary struct {
	Domain   string `json:"domain"`
	Earned   int    `json:"earned"`
	Total    int    `json:"total"`
	Percent  int    `json:"percent"`
	Attempts int    `json:"attempts"`
}

// ExamProgress is one exam's standing, derived from its records.
type ExamProgress struct {
	Attempts int `json:"attempts"`
	Counted  int `json:"counted"`
	// BestPercent is the highest score among COUNTED attempts, absent
	// when there are none. A pointer rather than a zero int because 0% is
	// a real score and "never sat" is not.
	BestPercent *int `json:"bestPercent,omitempty"`
	Passed      bool `json:"passed"`
	// LastAttemptAt is the most recent attempt of ANY kind. A drill is
	// still something the candidate did, and "last sat 3 weeks ago" would
	// be wrong if they drilled it yesterday.
	LastAttemptAt string          `json:"lastAttemptAt,omitempty"`
	WeakDomains   []DomainSummary `json:"weakDomains"`
}

// Summary is the whole record in four numbers, backing the dashboard.
type Summary struct {
	Attempts int `json:"attempts"`
	// PassedCount is distinct TRACK certifications with a counted,
	// passing attempt; TrackCount is how many the path holds. Restricting
	// the numerator to the track is what keeps "3 of 5" from ever reading
	// "6 of 5" once a bank outside the Kubestronaut path exists.
	PassedCount int             `json:"passedCount"`
	TrackCount  int             `json:"trackCount"`
	WeakDomains []DomainSummary `json:"weakDomains"`
}

// Summary rolls the whole record up.
func (s *Store) Summary() Summary { return Summarize(s.All()) }

// ProgressByBank rolls each bank's records up separately, keyed by bank
// id — the catalog's own join key, since a catalog row IS a bank.
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

// Summarize builds the cross-exam rollup.
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

// Progress builds one exam's standing from its own records.
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

// weakDomains rolls every record's domain slices together and returns
// them weakest first.
//
// Deliberately over EVERY record, not only the counted ones. "Which
// domains am I weak in" is a different question from "does this attempt
// count as a sitting": a domain drill is the single most informative
// thing a candidate can do about a weak domain, and a rollup that
// ignored drills would keep reporting the weakness the candidate has
// spent all week fixing. The wire contract agrees — ExamProgress's
// weakDomains is documented as empty "until at least one attempt has
// been graded", not until one has counted.
//
// Points, not the attempt's weightPct: weightPct is renormalized per
// attempt, so summing it across attempts of different shapes would add
// up percentages of different wholes.
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

	// Pre-sized, never nil: the wire contract types this as an array, and
	// a null here is a crash in every caller that maps over it.
	out := make([]DomainSummary, 0, len(order))
	for _, name := range order {
		a := totals[name]
		// A domain worth no points cannot be weak or strong. It is an
		// authoring artefact (every check skipped), not a signal.
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
