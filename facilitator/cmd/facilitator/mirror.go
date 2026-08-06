package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"kubestronaut-sim/facilitator/internal/evaluate"
	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/history"
)

const mirrorTimeout = 15 * time.Second

const (
	mirrorAttempts = 3
	mirrorBackoff  = time.Second
)

type mirror struct {
	url    string
	token  string
	client *http.Client
	logf   func(string, ...any)

	bankDir string
	ex      *exam.Exam

	sleep func(time.Duration)
}

func newMirror(rawURL, token, bankDir string, ex *exam.Exam, logf func(string, ...any)) *mirror {
	if rawURL == "" {
		return nil
	}
	return &mirror{
		url:     rawURL,
		token:   token,
		client:  &http.Client{Timeout: mirrorTimeout},
		logf:    logf,
		bankDir: bankDir,
		ex:      ex,
		sleep:   time.Sleep,
	}
}

func (m *mirror) post(ctx context.Context, rec history.Record, res *evaluate.Results) error {
	stored := withSolutions(res, m.ex, m.bankDir, m.logf)
	body, err := json.Marshal(struct {
		Record  history.Record    `json:"record"`
		Results *evaluate.Results `json:"results"`
	}{rec, stored})
	if err != nil {
		return fmt.Errorf("history mirror: encode: %w", err)
	}

	var last error
	for attempt := 1; attempt <= mirrorAttempts; attempt++ {
		if attempt > 1 {
			m.sleep(mirrorBackoff << (attempt - 2))
		}
		last = m.deliver(ctx, body)
		if last == nil {
			return nil
		}
		if errors.Is(last, errMirrorRefused) {

			break
		}
		m.logf("history mirror: attempt %d/%d: %v", attempt, mirrorAttempts, last)
	}
	return last
}

var errMirrorRefused = errors.New("refused")

func (m *mirror) deliver(ctx context.Context, body []byte) error {
	ctx, cancel := context.WithTimeout(ctx, mirrorTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("history mirror: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+m.token)

	resp, err := m.client.Do(req)
	if err != nil {
		return fmt.Errorf("history mirror: %w", err)
	}
	defer resp.Body.Close()

	detail, _ := io.ReadAll(io.LimitReader(resp.Body, 512))

	switch {
	case resp.StatusCode < 300:
		return nil
	case resp.StatusCode < 500:
		return fmt.Errorf("history mirror: %w: %s: %s", errMirrorRefused, resp.Status, bytes.TrimSpace(detail))
	default:
		return fmt.Errorf("history mirror: %s: %s", resp.Status, bytes.TrimSpace(detail))
	}
}
