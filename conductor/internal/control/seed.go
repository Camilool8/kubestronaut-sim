package control

import (
	"context"
	"errors"
	"fmt"
	"time"

	"kubestronaut-sim/conductor/internal/job"
)

var ErrNoSeedTargets = errors.New("control: a seed must name at least one question")

var ErrNoSeed = errors.New("control: nothing to seed in a multiple-choice bank")

const maxSeedQuestions = 200

func seedPhases() []job.PhaseSpec {
	return []job.PhaseSpec{
		{ID: "seed-questions", Label: "Set up the exam questions"},
	}
}

func (c *Controller) StartSeed(questions []string) (job.Job, error) {
	if len(questions) == 0 || len(questions) > maxSeedQuestions {
		return job.Job{}, fmt.Errorf("%w: got %d", ErrNoSeedTargets, len(questions))
	}
	if c.Catalog == nil || c.BankFile == "" {
		return job.Job{}, fmt.Errorf("control: seeding is not configured")
	}

	bank := c.activeBank()
	if bank == "" {
		return job.Job{}, fmt.Errorf("%w: no active bank", ErrUnknownQuestion)
	}

	if c.bankIsMCQ(bank) {
		return job.Job{}, ErrNoSeed
	}

	seen := make(map[string]bool, len(questions))
	for _, qid := range questions {

		if !questionIDPattern.MatchString(qid) {
			return job.Job{}, fmt.Errorf("%w: %q", ErrUnknownQuestion, qid)
		}

		if !c.Catalog.HasQuestion(bank, qid) {
			return job.Job{}, fmt.Errorf("%w: %q is not in bank %q", ErrUnknownQuestion, qid, bank)
		}

		if seen[qid] {
			return job.Job{}, fmt.Errorf("%w: %q appears twice", ErrUnknownQuestion, qid)
		}
		seen[qid] = true
	}

	state, err := c.sessionState(context.Background())
	if err != nil {
		return job.Job{}, fmt.Errorf("control: check session state: %w", err)
	}
	if state == "running" {
		return job.Job{}, ErrSessionRunning
	}

	j, err := c.Store.Begin("seed", bank, seedPhases())
	if err != nil {
		return job.Job{}, err
	}
	go c.runSeed(j.ID, bank, questions)
	return j, nil
}

func (c *Controller) runSeed(jobID, bank string, questions []string) {
	ctx := context.Background()

	c.Store.StartPhase(jobID, "seed-questions")

	id, err := c.Engine.FindContainer(ctx, c.Project, "k8s-env")
	if err != nil {
		c.Store.Fail(jobID, fmt.Sprintf("k8s-env: %v", err))
		return
	}

	onLine := func(line string) { c.Store.AppendLog(jobID, line) }

	for n, qid := range questions {

		c.Store.SetPhaseDetail(jobID, "seed-questions", fmt.Sprintf("question %d of %d", n+1, len(questions)))
		c.Store.AppendLog(jobID, fmt.Sprintf("seeding %s (%d of %d)", qid, n+1, len(questions)))

		if err := c.seedOne(ctx, id, bank, qid, onLine); err != nil {
			c.Store.Fail(jobID, err.Error())
			return
		}
	}

	c.Store.Complete(jobID)
}

func (c *Controller) seedOne(ctx context.Context, containerID, bank, qid string, onLine func(string)) error {
	ctx, cancel := context.WithTimeout(ctx, seedQuestionBudget)
	defer cancel()

	cmd := []string{"bash", "-c", fmt.Sprintf("bash /banks/%s/%s/setup.sh", bank, qid)}
	exit, out, err := c.Engine.Exec(ctx, containerID, cmd, onLine)
	if err != nil {
		return fmt.Errorf("seeding %s: k8s-env: exec: %w", qid, err)
	}
	if exit != 0 {
		return fmt.Errorf("seeding %s failed (exit %d): %s", qid, exit, tail(out, 500))
	}
	return nil
}

// Its own number rather than the re-seed budget it used to borrow, because the
// two are watched by different people. A re-seed is interactive — one question,
// a cluster that already exists, a candidate looking at a spinner — and 240s is
// the right point to give up. Preparing an attempt happens once, behind a
// progress screen, and one CKA question builds a whole kind cluster before it
// seeds anything into it.
//
// The reason for the headroom is not that seeding is slow: measured on this
// image, the aux-cluster questions cost about 16s each and a seven-question
// domain sweep averages 35s a question. It is that this deadline competes with
// the timeouts inside the setups themselves — `kubectl rollout status
// --timeout=120s`, and the readiness loops in banks/_lib/aux.sh. Whichever
// fires first writes the message, and the inner one names what did not converge
// while this one can only say "context deadline exceeded". So the outer budget
// is deliberately larger than any single setup's internal waits can sum to.
const seedQuestionBudget = 600 * time.Second
