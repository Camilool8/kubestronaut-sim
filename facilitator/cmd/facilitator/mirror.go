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

// mirrorTimeout bounds one delivery attempt.
//
// Generous because the body is the whole graded-results document, not
// because the hub is slow — and because this runs after the candidate
// already has their score, so nothing is waiting on it.
const mirrorTimeout = 15 * time.Second

// mirrorAttempts is how many times one attempt is offered before it is
// given up on, and mirrorBackoff the pause after the first failure
// (doubled for the second).
//
// Retried at all because in a hosted session this is the ONLY copy that
// survives: the Pod's own /state dies with the Pod, usually within the
// hour. Bounded at three because the failure that is worth retrying is
// a hub mid-redeploy, which is seconds, and the one that is not is a
// hub that is gone, which no number of attempts fixes.
const (
	mirrorAttempts = 3
	mirrorBackoff  = time.Second
)

// mirror posts each graded attempt to a store that outlives this Pod.
//
// It is the hosted tier's whole reason for the facilitator to know
// anything about the outside world, and it is default-off: with
// HISTORY_WEBHOOK_URL unset there is no mirror, no request and no
// behaviour change, which is what `./sim up` runs and must keep
// running. The local history write is untouched either way — this is a
// copy, not a replacement, and a hub that is down must never cost a
// candidate the record on their own disk.
//
// The facilitator still has no idea who the candidate is. It presents
// the ticket it was started with; the hub reads the identity out of
// that. Nothing here can name a user, which is what keeps one session
// from writing into another's history.
type mirror struct {
	url    string
	token  string
	client *http.Client
	logf   func(string, ...any)
	// bankDir and ex are what makes the stored copy self-contained: the
	// reference solutions live in the bank, the bank lives in this Pod,
	// and the Pod is the thing the stored copy has to outlive. See
	// withSolutions.
	bankDir string
	ex      *exam.Exam
	// sleep is overridable so the retry can be tested without waiting.
	sleep func(time.Duration)
}

// newMirror returns nil when HISTORY_WEBHOOK_URL is unset, which is the
// only configuration `./sim up` has ever had.
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

// post delivers one attempt, record and full results together.
//
// The results document is sent whole rather than summarised because it
// is what the review screen renders: the per-check artifacts carry the
// actual, the expected and the why, and a summary would leave a hosted
// candidate with a score and no explanation of it. The reference
// solutions are attached HERE, on the way out and on a copy, for the
// same reason and one more — they are the half that says what right
// looked like, and they do not otherwise survive the Pod.
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
			// A 4xx is this build disagreeing with that hub about the
			// request — a bad ticket, a body it will not take. Retrying
			// sends the identical bytes to the identical answer.
			break
		}
		m.logf("history mirror: attempt %d/%d: %v", attempt, mirrorAttempts, last)
	}
	return last
}

// errMirrorRefused marks a failure that a retry cannot change.
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
	// Drained so the connection can be reused, and capped because the
	// only use for what comes back is putting it in a log line.
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
