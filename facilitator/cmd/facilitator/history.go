package main

import (
	"context"
	"errors"
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

const banksTimeout = 5 * time.Second

const maxBanksBytes = 1 << 20

func recordAttempt(store *history.Store, mir *mirror, ex *exam.Exam, token string, snap session.Snapshot, res *evaluate.Results) error {
	if res == nil || (store == nil && mir == nil) {
		return nil
	}
	if !session.Recorded(snap.Mode) {
		return nil
	}
	if token == "" {

		return fmt.Errorf("history: attempt has no token; not recorded")
	}

	rec := history.Record{
		ID:   token,
		Bank: res.Bank,

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

	var errs []error
	if store != nil {
		if _, err := store.Add(rec); err != nil {
			errs = append(errs, err)
		}
	}
	if mir != nil {
		if err := mir.post(context.Background(), rec, res); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func declaredLength(ex *exam.Exam) int {
	if exam.Pooled(ex) {
		return ex.ExamLength
	}
	return len(ex.Questions)
}

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

func newBanksFetcher(base *url.URL, rt http.RoundTripper) api.BanksFetcher {
	client := &http.Client{Timeout: banksTimeout, Transport: rt}
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
