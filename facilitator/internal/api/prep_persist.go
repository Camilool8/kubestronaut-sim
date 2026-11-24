package api

import (
	"errors"
	"fmt"
	"io/fs"
	"log"
	"time"

	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/session"
)

func (s *server) persistPrepLocked() {
	if s.prepFile == "" {
		return
	}
	if s.prep == nil || s.prep.jobID == "" {
		if err := session.RemovePrep(s.prepFile); err != nil {
			log.Printf("facilitator: %v", err)
		}
		return
	}
	p := session.Prep{
		Bank:            s.prepBank,
		JobID:           s.prep.jobID,
		Mode:            s.prep.mode,
		DurationSeconds: int(s.prep.dur / time.Second),
		QuestionIDs:     s.prep.draw.QuestionIDs,
		Seed:            s.prep.draw.Seed,
		PoolDigest:      s.prep.draw.PoolDigest,
		DomainFilter:    s.prep.draw.DomainFilter,
		AwaitStart:      s.prep.awaitStart,
		StartedAt:       s.prep.startedAt,
	}
	if !s.prep.readyAt.IsZero() {
		readyAt := s.prep.readyAt
		p.Ready = true
		p.ReadyAt = &readyAt
	}
	if err := session.SavePrep(s.prepFile, p); err != nil {
		log.Printf("facilitator: the preparation will not survive a restart: %v", err)
	}
}

func (s *server) restorePrep() {
	if s.prepFile == "" {
		return
	}
	saved, err := session.LoadPrep(s.prepFile)
	if errors.Is(err, fs.ErrNotExist) {
		return
	}

	s.prepMu.Lock()
	defer s.prepMu.Unlock()

	if err != nil {
		s.discardSavedPrepLocked(err.Error())
		return
	}
	if state := s.mgr.Snapshot().State; state != "idle" {
		s.discardSavedPrepLocked("an attempt is already " + state)
		return
	}
	if !s.seedRequired() || s.seeder == nil || s.control == nil {
		s.discardSavedPrepLocked("this exam does not prepare its environment per attempt")
		return
	}
	if saved.Bank != s.prepBank {
		s.discardSavedPrepLocked(fmt.Sprintf("it was made for bank %q, the active bank is %q", saved.Bank, s.prepBank))
		return
	}
	draw := saved.Draw()
	if err := s.savedDrawFits(draw); err != nil {
		s.losePrepLocked(err.Error())
		return
	}

	s.prepGen++
	s.prep = &prep{
		gen:        s.prepGen,
		jobID:      saved.JobID,
		mode:       saved.Mode,
		dur:        saved.Duration(),
		draw:       draw,
		startedAt:  saved.StartedAt,
		awaitStart: saved.AwaitStart,
	}
	s.prepError = ""
	s.seeded = newSeededSet(draw.QuestionIDs)

	var readyAt time.Time
	if saved.ReadyAt != nil {
		readyAt = *saved.ReadyAt
	}
	log.Printf("facilitator: found a saved preparation for seed job %s; checking the exam environment still holds it", saved.JobID)
	go s.resumePrep(*s.prep, readyAt)
}

func (s *server) savedDrawFits(d session.Draw) error {
	if err := exam.CheckPool(s.ex, d.PoolDigest); err != nil {
		return err
	}
	known := make(map[string]bool, len(s.ex.Questions))
	for _, q := range s.ex.Questions {
		known[q.ID] = true
	}
	for _, id := range d.QuestionIDs {
		if !known[id] {
			return fmt.Errorf("question %s is no longer in the bank", id)
		}
	}
	return nil
}

func (s *server) resumePrep(p prep, readyAt time.Time) {
	defer func() {
		if r := recover(); r != nil {
			s.losePrep(p.gen, fmt.Sprintf("checking the exam environment failed: %v", r))
		}
	}()

	var st conductorStatus
	for tries := 1; ; tries++ {
		if !s.prepIsCurrent(p.gen) {
			return
		}
		var err error
		st, err = s.conductorStatus()
		if err == nil {
			break
		}
		if tries >= prepMaxPollErrors {
			s.losePrep(p.gen, fmt.Sprintf("the exam environment did not answer: %v", err))
			return
		}
		time.Sleep(prepPollInterval)
	}

	switch {
	case st.Job != nil && st.Job.ID == p.jobID && st.Job.Op == seedJobOp:
		s.watchPrepare(p)
	case st.Job == nil && st.LastJob != nil && st.LastJob.ID == p.jobID && st.LastJob.Op == seedJobOp:
		switch {
		case st.LastJob.Error != "":
			s.failPrepare(p.gen, st.LastJob.Error)
		case p.awaitStart:
			if readyAt.IsZero() {
				readyAt = time.Now()
			}
			s.markReady(p.gen, readyAt)
		default:
			s.startPreparedAttempt(p)
		}
	default:
		s.losePrep(p.gen, fmt.Sprintf("the exam environment no longer reports seed job %s as its latest job", p.jobID))
	}
}

func (s *server) losePrep(gen uint64, reason string) {
	s.prepMu.Lock()
	defer s.prepMu.Unlock()

	if s.prep == nil || s.prep.gen != gen {
		return
	}
	s.losePrepLocked(reason)
}

func (s *server) losePrepLocked(reason string) {
	log.Printf("facilitator: the saved preparation cannot be resumed (%s): %v", reason, errPreparationLost)
	s.prep = nil
	s.prepError = errPreparationLost.Error()
	s.seeded = &seededSet{}
	s.persistPrepLocked()
}

func (s *server) discardSavedPrepLocked(reason string) {
	log.Printf("facilitator: discarding the saved preparation: %s", reason)
	if err := session.RemovePrep(s.prepFile); err != nil {
		log.Printf("facilitator: %v", err)
	}
}
