package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"kubestronaut-sim/facilitator/internal/api"
	"kubestronaut-sim/facilitator/internal/evaluate"
	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/history"
	"kubestronaut-sim/facilitator/internal/session"
)

// banksTimeout bounds the server-side call to the conductor behind
// GET /api/catalog. Short on purpose: the catalog is the app's front
// door, and a candidate waiting on a conductor that is mid-rebuild
// should get the degraded list quickly rather than a spinner that
// eventually times out in their browser instead.
const banksTimeout = 5 * time.Second

// maxBanksBytes bounds the conductor's bank list. Five certifications of
// metadata is a few kilobytes; this is only here so a wedged peer cannot
// stream the facilitator out of memory.
const maxBanksBytes = 1 << 20

// recordAttempt appends one graded attempt to the durable record.
//
// Called from the grader once SetResults has succeeded, so what is
// written is exactly what the candidate was shown. It returns an error
// rather than handling one: the caller logs it and moves on, because a
// history write must never be able to fail a grade.
//
// Only recorded modes produce a record. Training is deliberate practice
// with the hints and the solution open; counting it would make every
// "best score" meaningless, and session.Recorded is the one place that
// rule is defined — the mode screen advertises the same predicate.
func recordAttempt(store *history.Store, ex *exam.Exam, token string, snap session.Snapshot, res *evaluate.Results) error {
	if store == nil || res == nil {
		return nil
	}
	if !session.Recorded(snap.Mode) {
		return nil
	}
	if token == "" {
		// The id is what makes recording idempotent and importing
		// de-duplicable. Without one there is nothing to key on, and a
		// record that cannot be de-duplicated is worse than none.
		return fmt.Errorf("history: attempt has no token; not recorded")
	}

	rec := history.Record{
		ID:   token,
		Bank: res.Bank,
		// Certification and ExamTitle are COPIED, not referenced. The
		// dashboard shows five certifications while only one bank is
		// loadable at a time, so a record that pointed at its bank would
		// render as blanks for the other four.
		Certification:   ex.Certification,
		ExamTitle:       ex.Title,
		ExamType:        ex.Type,
		Mode:            snap.Mode,
		StartedAt:       snap.StartedAt,
		GradedAt:        res.GradedAt,
		Seed:            res.Seed,
		DomainFilter:    res.DomainFilter,
		DurationSeconds: res.DurationSeconds,
		ElapsedSeconds:  res.ElapsedSeconds,
		QuestionCount:   len(res.Questions),
		Earned:          res.Earned,
		Total:           res.Total,
		Percent:         res.Percent,
		PointsPercent:   res.PointsPercent,
		PassingScore:    res.PassingScore,
		Passed:          res.Passed,
		Counted:         history.Counted(snap.Mode, res.DomainFilter, len(res.Questions), declaredLength(ex)),
		Domains:         toHistoryDomains(res.Domains),
	}

	if _, err := store.Add(rec); err != nil {
		return err
	}
	return nil
}

// declaredLength is the bank's declared exam length: ExamLength for a
// pooled bank, the whole authored pool otherwise. It is what a draw has
// to match to be a full-length attempt.
func declaredLength(ex *exam.Exam) int {
	if exam.Pooled(ex) {
		return ex.ExamLength
	}
	return len(ex.Questions)
}

// toHistoryDomains copies the grader's domain rollup into the record's
// own type. Copied field by field rather than shared, because a record
// is frozen at the moment it is written and must not change shape when
// the grader does.
func toHistoryDomains(in []evaluate.DomainResult) []history.DomainResult {
	if len(in) == 0 {
		return nil
	}
	out := make([]history.DomainResult, 0, len(in))
	for _, d := range in {
		out = append(out, history.DomainResult{
			Domain:        d.Domain,
			Earned:        d.Earned,
			Total:         d.Total,
			WeightPct:     d.WeightPct,
			QuestionCount: d.QuestionCount,
		})
	}
	return out
}

// newBanksFetcher returns the api.BanksFetcher /api/catalog joins
// history to: a plain server-side GET of the conductor's bank list.
//
// It is a GET and nothing else. The catalog must be readable without any
// risk of starting work — the conductor's other endpoints rebuild
// clusters — so this reaches for exactly one route and cannot be talked
// into another.
func newBanksFetcher(base *url.URL) api.BanksFetcher {
	client := &http.Client{Timeout: banksTimeout}
	endpoint := base.JoinPath("/api/control/banks").String()

	return func(ctx context.Context) ([]byte, error) {
		ctx, cancel := context.WithTimeout(ctx, banksTimeout)
		defer cancel()

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, err
		}
		resp, err := client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("bank list: %w", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("bank list: conductor answered %s", resp.Status)
		}
		return io.ReadAll(io.LimitReader(resp.Body, maxBanksBytes))
	}
}
