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

// maxImportBytes bounds POST /api/history/import. An export of a
// thousand attempts is well under a megabyte; four is room to be wrong
// about that without letting a stray upload become the facilitator's
// memory ceiling.
const maxImportBytes = 4 << 20

// BanksFetcher returns the conductor's GET /api/control/banks response
// body, or an error if the conductor could not be reached.
//
// A func rather than a URL so main owns the HTTP client (and its
// timeout) and tests can answer without a socket. /api/catalog is the
// only caller.
type BanksFetcher func(ctx context.Context) ([]byte, error)

// Option configures the optional dependencies of the handler New
// returns. Optional because every one of them post-dates the tests and
// dev runs that construct a server without them, and because the
// endpoints they back must degrade rather than disappear.
type Option func(*server)

// WithHistory gives the server the durable attempt record. Without it
// the /api/history endpoints answer 503 rather than 404: the route
// exists in this build, it just has nowhere to write.
func WithHistory(h *history.Store) Option {
	return func(s *server) { s.hist = h }
}

// WithBanks gives /api/catalog its server-side route to the conductor's
// bank list. Without it — or when the call fails — the catalog is served
// from the active bank and attempt history alone. See handleCatalog.
func WithBanks(f BanksFetcher) Option {
	return func(s *server) { s.banks = f }
}

// historyResponse is the GET /api/history JSON shape.
type historyResponse struct {
	// Attempts is most recent first, and is an array even when empty:
	// null here is a crash in every caller that maps over it.
	Attempts []history.Record `json:"attempts"`
	Summary  history.Summary  `json:"summary"`
}

// requireHistory answers 503 and reports false when this build has no
// record to serve.
func (s *server) requireHistory(w http.ResponseWriter) bool {
	if s.hist == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "attempt history is not available in this configuration")
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

// handleHistoryDelete erases every attempt. There is no undo and no
// server-side backup, so the confirmation belongs to the caller — this
// handler does exactly what it is asked.
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

// handleHistoryExport serves the record as a downloadable document.
//
// Content-Disposition, so a plain <a href> saves a named file instead of
// rendering JSON in a tab. The date is in the name because the one thing
// a candidate needs from a folder of these is which is newest.
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

// importResponse is the POST /api/history/import JSON shape.
type importResponse struct {
	Imported int `json:"imported"`
	Skipped  int `json:"skipped"`
}

// handleHistoryImport merges an exported document into the record.
//
// Merge, never replace. Importing a backup must not be a way to lose the
// attempts made since it was taken, so records already present by id are
// skipped and everything else is added — which also makes importing the
// same file twice a no-op.
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

// bankEntry is one row of the conductor's bank list on the wire. It
// mirrors conductor/internal/catalog.Entry's exported JSON, and is
// re-declared rather than shared because the two services are separate
// Go modules that talk over HTTP.
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

// banksDoc is the conductor's GET /api/control/banks body.
type banksDoc struct {
	Active string      `json:"active"`
	Banks  []bankEntry `json:"banks"`
}

// catalogExam is a bank row with how the candidate has gone on it. The
// embedded entry flattens, so the row is a BankEntry plus one field —
// exactly what the client's `CatalogExam extends BankEntry` says.
type catalogExam struct {
	bankEntry
	Progress history.ExamProgress `json:"progress"`
}

// catalogResponse is the GET /api/catalog JSON shape.
type catalogResponse struct {
	Active  string          `json:"active"`
	Exams   []catalogExam   `json:"exams"`
	Summary history.Summary `json:"summary"`
}

// handleCatalog joins the conductor's bank list to attempt history.
//
// Facilitator-served rather than proxied to the conductor, for two
// reasons: the conductor has no access to the state volume the history
// lives in, and LOOKING at the exam list must never be able to trigger a
// rebuild.
//
// A conductor that does not answer degrades rather than 500s. This is
// the app's front door: a candidate who cannot reach the list cannot
// reach anything, and "here is the exam you have loaded, plus everything
// you have already sat" is a far better answer than an error page. The
// degraded rows say so themselves — see degradedBanks.
func (s *server) handleCatalog(w http.ResponseWriter, r *http.Request) {
	active := s.mgr.Snapshot().Bank
	if active == "" {
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
		// Pre-sized, never nil: an empty catalog must marshal as [].
		Exams:   make([]catalogExam, 0, len(banks.Banks)),
		Summary: summary,
	}
	for _, b := range banks.Banks {
		row := catalogExam{bankEntry: b, Progress: progress[b.ID]}
		// A bank never sat still needs its weakDomains array present, for
		// the same reason every other list here is pre-sized.
		if row.Progress.WeakDomains == nil {
			row.Progress.WeakDomains = []history.DomainSummary{}
		}
		resp.Exams = append(resp.Exams, row)
	}
	writeJSON(w, http.StatusOK, resp)
}

// fetchBanks calls the conductor and decodes its bank list.
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

// degradedBanks is the catalog with no conductor: the bank this
// facilitator has actually loaded, plus one row for every other bank the
// attempt history remembers.
//
// The history-only rows are marked unavailable with a reason, because
// this build genuinely does not know whether they can still be switched
// to — the service that owns that answer is the one that did not reply.
// Offering them as available would make the exam selector's one
// destructive action (switch banks, which rebuilds the cluster) the
// thing that discovers the outage.
func (s *server) degradedBanks(active string, progress map[string]history.ExamProgress) []bankEntry {
	out := []bankEntry{{
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
	}}

	seen := map[string]bool{active: true}
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

// historyRows is All() on a possibly-nil store.
func historyRows(h *history.Store) []history.Record {
	if h == nil {
		return nil
	}
	return h.All()
}

// bankLength is the loaded bank's DECLARED exam length: ExamLength for a
// pooled bank, the whole pool otherwise.
//
// Deliberately not (*server).declaredQuestionCount, which answers a
// different question — that one narrows to the current attempt's draw,
// which is right for "Question 1 of N" and wrong for a catalog card
// describing the bank itself.
func bankLength(ex *exam.Exam) int {
	if exam.Pooled(ex) {
		return ex.ExamLength
	}
	return len(ex.Questions)
}
