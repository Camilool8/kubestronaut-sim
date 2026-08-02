package control

import (
	"context"
	"errors"
	"fmt"

	"kubestronaut-sim/conductor/internal/job"
)

// ErrNoSeedTargets rejects a seed request that names no questions, or
// more than any bank could plausibly hold. Mapped to 400.
var ErrNoSeedTargets = errors.New("control: a seed must name at least one question")

// ErrNoSeed rejects a seed against an mcq bank: there is no setup.sh and
// no cluster state to prepare. Mapped to 400.
var ErrNoSeed = errors.New("control: nothing to seed in a multiple-choice bank")

// maxSeedQuestions bounds one request. The largest bank in the tree
// authors ~100 questions; a request longer than this is a caller bug or
// a probe, and either way running it would hold the single-job lock for
// hours.
const maxSeedQuestions = 200

// seedPhases is the checklist a seed job walks through.
//
// One phase, not one per question. A 16-row checklist would name the
// bank's internal question ids at a candidate who has not seen a single
// question yet, and the per-question progress the row genuinely needs is
// already carried by its detail line ("question 3 of 16") — the same
// shape images/k8s-env/bootstrap.sh publishes for the boot-time seed
// this replaces.
func seedPhases() []job.PhaseSpec {
	return []job.PhaseSpec{
		{ID: "seed-questions", Label: "Set up the exam questions"},
	}
}

// StartSeed begins an asynchronous job that runs setup.sh for each of
// questions, in order, inside the k8s-env container — preparing the
// cluster for exactly the questions one attempt drew.
//
// This exists because a pooled hands-on bank's boot deliberately does
// NOT seed (images/k8s-env/bootstrap.sh): seeding the whole pool to
// then use a sixth of it is minutes of a candidate's life for questions
// they will never open. The work has to happen somewhere, and it happens
// here, as a job, for one reason above all others — the candidate's exam
// clock must not be running during it. A job is polled through GET
// /api/control/status and rendered as a progress overlay the UI already
// has; a blocking HTTP call would be a four-minute request against a
// screen with nothing to show.
//
// Every gate Reseed applies to one question id applies here to a list of
// them, and for the same reason: these values arrive from the browser
// (by way of the facilitator's draw) and end up inside a shell command.
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
	// Before anything shells out: an mcq bank has no setup.sh, so every
	// exec below would produce the same confusing bash error.
	if c.bankIsMCQ(bank) {
		return job.Job{}, ErrNoSeed
	}

	seen := make(map[string]bool, len(questions))
	for _, qid := range questions {
		// Shape first, before the value is used for anything at all.
		if !questionIDPattern.MatchString(qid) {
			return job.Job{}, fmt.Errorf("%w: %q", ErrUnknownQuestion, qid)
		}
		// The allowlist. A pattern says the id is well-formed; only this
		// says it is real.
		if !c.Catalog.HasQuestion(bank, qid) {
			return job.Job{}, fmt.Errorf("%w: %q is not in bank %q", ErrUnknownQuestion, qid, bank)
		}
		// A repeat is a caller bug, not something to quietly collapse:
		// running one question's setup.sh twice is wasted minutes at best,
		// and at worst it re-seeds a question the loop has already prepared.
		if seen[qid] {
			return job.Job{}, fmt.Errorf("%w: %q appears twice", ErrUnknownQuestion, qid)
		}
		seen[qid] = true
	}

	// Seeding re-runs setup.sh, which discards whatever is in the cluster
	// for those questions — hostile mid-attempt, and never needed there:
	// this runs before the clock starts, by construction.
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

// runSeed executes each question's setup.sh in turn, failing the job at
// the first one that does not exit 0.
//
// Sequential and one exec per question, rather than a single shell loop:
// a failure has to name the question that failed (a candidate cannot be
// dropped into an exam against a half-prepared cluster with "exit 1" as
// the explanation), and the per-question boundary is what lets the phase
// detail count honestly through the list. Each question gets its own
// budget for the same reason reseedBudget is 240s and not 120 — one Helm
// question's setup installs four releases and waits on three of them.
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
		// The detail is the count, not the command's last line: this loop
		// prints hundreds of kubectl acknowledgements and exactly one of
		// them is ever interesting. The build log keeps them all; the row
		// says how far through we are, as bootstrap.sh's own seed loop does.
		c.Store.SetPhaseDetail(jobID, "seed-questions", fmt.Sprintf("question %d of %d", n+1, len(questions)))
		c.Store.AppendLog(jobID, fmt.Sprintf("seeding %s (%d of %d)", qid, n+1, len(questions)))

		if err := c.seedOne(ctx, id, bank, qid, onLine); err != nil {
			c.Store.Fail(jobID, err.Error())
			return
		}
	}

	c.Store.Complete(jobID)
}

// seedOne runs one question's setup.sh under its own timeout.
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

// seedQuestionBudget bounds one setup.sh, and is deliberately the same
// figure as reseedBudget: it is the same script being run by a different
// caller, and two budgets for one command would drift.
const seedQuestionBudget = reseedBudget
