package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/history"
)

const maxImportBytes = 4 << 20

type BanksFetcher func(ctx context.Context) ([]byte, error)

type Option func(*server)

func WithHistory(h *history.Store) Option {
	return func(s *server) { s.hist = h }
}

func WithBanks(f BanksFetcher) Option {
	return func(s *server) { s.banks = f }
}

type historyResponse struct {
	Attempts []history.Record `json:"attempts"`
	Summary  history.Summary  `json:"summary"`
}

func (s *server) requireHistory(w http.ResponseWriter) bool {
	if s.hist == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "attempt history is not available in this configuration")
		return false
	}
	return true
}

func (s *server) requireExam(w http.ResponseWriter) bool {
	if s.ex == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "no exam is loaded yet — choose one to build its environment")
		return false
	}
	return true
}

func (s *server) handleHistoryGet(w http.ResponseWriter, r *http.Request) {
	if !s.requireHistory(w) {
		return
	}
	writeJSON(w, http.StatusOK, historyResponse{
		Attempts: s.hist.All(),
		Summary:  s.hist.Summary(),
	})
}

func (s *server) handleHistorySummary(w http.ResponseWriter, r *http.Request) {
	if !s.requireHistory(w) {
		return
	}
	writeJSON(w, http.StatusOK, s.hist.Summary())
}

func (s *server) handleHistoryDelete(w http.ResponseWriter, r *http.Request) {
	if !s.requireHistory(w) {
		return
	}
	if err := s.hist.Clear(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleHistoryExport(w http.ResponseWriter, r *http.Request) {
	if !s.requireHistory(w) {
		return
	}
	doc := s.hist.Document()
	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	name := fmt.Sprintf("kubestronaut-sim-history-%s.json", time.Now().UTC().Format("2006-01-02"))
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", name))
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

type importResponse struct {
	Imported int `json:"imported"`
	Skipped  int `json:"skipped"`
}

func (s *server) handleHistoryImport(w http.ResponseWriter, r *http.Request) {
	if !s.requireHistory(w) {
		return
	}
	var doc history.Document
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxImportBytes)).Decode(&doc); err != nil {
		writeJSONError(w, http.StatusBadRequest, "not a history export: "+err.Error())
		return
	}
	if err := history.CheckDocument(doc); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	imported, skipped, err := s.hist.Merge(doc.Attempts)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, importResponse{Imported: imported, Skipped: skipped})
}

type bankEntry struct {
	ID                string `json:"id"`
	Title             string `json:"title"`
	Certification     string `json:"certification,omitempty"`
	Description       string `json:"description,omitempty"`
	ExamType          string `json:"examType"`
	DurationSeconds   int    `json:"durationSeconds,omitempty"`
	PassingScore      int    `json:"passingScore,omitempty"`
	KubernetesVersion string `json:"kubernetesVersion,omitempty"`
	QuestionCount     int    `json:"questionCount,omitempty"`
	PoolCount         int    `json:"poolCount,omitempty"`
	Available         bool   `json:"available"`
	ComingSoon        bool   `json:"comingSoon,omitempty"`
	Note              string `json:"note,omitempty"`
}

type banksDoc struct {
	Active string      `json:"active"`
	Banks  []bankEntry `json:"banks"`
}

type catalogExam struct {
	bankEntry
	Progress history.ExamProgress `json:"progress"`
}

type catalogResponse struct {
	Active  string          `json:"active"`
	Exams   []catalogExam   `json:"exams"`
	Summary history.Summary `json:"summary"`
}

func (s *server) handleCatalog(w http.ResponseWriter, r *http.Request) {

	active := s.mgr.Snapshot().Bank
	if active == "" && s.ex != nil {
		active = s.ex.Name
	}

	progress := map[string]history.ExamProgress{}
	summary := history.Summary{}
	if s.hist != nil {
		progress = s.hist.ProgressByBank()
		summary = s.hist.Summary()
	}

	banks, err := s.fetchBanks(r.Context())
	if err != nil {
		log.Printf("facilitator: catalog: %v (serving the active bank and attempt history instead)", err)
		banks = banksDoc{Active: active, Banks: s.degradedBanks(active, progress)}
	}
	if banks.Active != "" {
		active = banks.Active
	}

	resp := catalogResponse{
		Active: active,

		Exams:   make([]catalogExam, 0, len(banks.Banks)),
		Summary: summary,
	}
	for _, b := range banks.Banks {
		row := catalogExam{bankEntry: b, Progress: progress[b.ID]}

		if row.Progress.WeakDomains == nil {
			row.Progress.WeakDomains = []history.DomainSummary{}
		}
		resp.Exams = append(resp.Exams, row)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) fetchBanks(ctx context.Context) (banksDoc, error) {
	if s.banks == nil {
		return banksDoc{}, fmt.Errorf("no route to the bank list is configured")
	}
	raw, err := s.banks(ctx)
	if err != nil {
		return banksDoc{}, err
	}
	var doc banksDoc
	if err := json.Unmarshal(raw, &doc); err != nil {
		return banksDoc{}, fmt.Errorf("bank list is not valid JSON: %w", err)
	}
	return doc, nil
}

func (s *server) degradedBanks(active string, progress map[string]history.ExamProgress) []bankEntry {

	var out []bankEntry
	seen := map[string]bool{}
	if s.ex != nil {
		out = append(out, bankEntry{
			ID:                active,
			Title:             s.ex.Title,
			Certification:     s.ex.Certification,
			ExamType:          s.ex.Type,
			DurationSeconds:   int(s.ex.Duration.Seconds()),
			PassingScore:      s.ex.PassingScore,
			KubernetesVersion: s.ex.KubernetesVersion,
			QuestionCount:     bankLength(s.ex),
			PoolCount:         len(s.ex.Questions),
			Available:         true,
		})
		seen[active] = true
	}

	for _, r := range historyRows(s.hist) {
		if seen[r.Bank] {
			continue
		}
		seen[r.Bank] = true
		out = append(out, bankEntry{
			ID:            r.Bank,
			Title:         r.ExamTitle,
			Certification: r.Certification,
			ExamType:      r.ExamType,
			PassingScore:  r.PassingScore,
			Available:     false,
			Note:          "the exam list is unavailable; this row is from your attempt history",
		})
	}
	return out
}

func historyRows(h *history.Store) []history.Record {
	if h == nil {
		return nil
	}
	return h.All()
}

func bankLength(ex *exam.Exam) int {
	if exam.Pooled(ex) {
		return ex.ExamLength
	}
	return len(ex.Questions)
}
