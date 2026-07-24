// Package api wires the facilitator's exam, session, evaluate, and
// desktop packages into the HTTP surface the exam UI (and `./sim
// reset`) talks to: JSON everywhere, errors as {"error":"..."}, exactly
// per the milestone design's §3 HTTP API table.
package api

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/session"
)

// Grader kicks off an asynchronous grading run. It is invoked by the
// end-session handler (both the initial submit and any ended-without-
// results re-grade) after Manager.End succeeds; the expiry path fires
// the same func from outside this package (main wires session's
// onExpire to it too), so callers must make it safe to invoke from
// multiple goroutines and safe to call more than once in a row.
type Grader func()

// server holds every dependency the HTTP handlers need. It is
// unexported; New is the only way to obtain the http.Handler it backs.
type server struct {
	ex      *exam.Exam
	bankDir string
	mgr     *session.Manager
	grade   Grader
	desktop http.Handler
	ui      fs.FS
}

// New builds the facilitator's complete HTTP handler: the /api/*
// endpoints, /healthz, the desktop reverse proxy mounted at /desktop
// (seeing requests' original, unstripped paths, as desktop.New
// requires), and the embedded exam UI served from ui with SPA
// fallback to index.html.
//
// bankDir is the question bank directory (the same one exam.Load was
// given) — the exam package itself does not retain it, but the
// question/solution endpoints need it to read question.md/solution.md
// from disk per request.
func New(ex *exam.Exam, bankDir string, mgr *session.Manager, grade Grader, desktop http.Handler, ui fs.FS) http.Handler {
	s := &server{ex: ex, bankDir: bankDir, mgr: mgr, grade: grade, desktop: desktop, ui: ui}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealthz)
	mux.HandleFunc("GET /api/exam", s.handleExam)
	mux.HandleFunc("GET /api/questions/{id}", s.handleQuestion)
	mux.HandleFunc("GET /api/questions/{id}/solution", s.handleSolution)
	mux.HandleFunc("POST /api/session/start", s.handleSessionStart)
	mux.HandleFunc("GET /api/session", s.handleSessionGet)
	mux.HandleFunc("POST /api/session/end", s.handleSessionEnd)
	mux.HandleFunc("GET /api/results", s.handleResults)
	mux.HandleFunc("DELETE /api/session", s.handleSessionDelete)

	// Registered as both the exact path and the subtree so every
	// "/desktop" and "/desktop/*" request reaches desktop with its
	// original, unstripped URL path — desktop.New needs to see
	// "/desktop" itself (to redirect to "/desktop/") as well as every
	// path beneath it (to strip the prefix and lock-gate or proxy).
	mux.Handle("/desktop", desktop)
	mux.Handle("/desktop/", desktop)

	mux.HandleFunc("/", s.handleSPA)

	return mux
}

// handleHealthz backs the compose healthcheck: plain "ok", not JSON,
// per the spec table.
func handleHealthz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

// examResponse is the GET /api/exam JSON shape.
type examResponse struct {
	Name              string             `json:"name"`
	Title             string             `json:"title"`
	DurationSeconds   int                `json:"durationSeconds"`
	PassingScore      int                `json:"passingScore"`
	KubernetesVersion string             `json:"kubernetesVersion"`
	Questions         []examQuestionInfo `json:"questions"`
}

// examQuestionInfo is one question's entry in the GET /api/exam
// response. TotalPoints is computed here (not stored on exam.Question)
// as the sum of every non-Skip check's Points.
type examQuestionInfo struct {
	ID          string `json:"id"`
	Instance    string `json:"instance"`
	Domain      string `json:"domain"`
	Weight      int    `json:"weight"`
	TotalPoints int    `json:"totalPoints"`
}

func (s *server) handleExam(w http.ResponseWriter, r *http.Request) {
	resp := examResponse{
		Name:              s.ex.Name,
		Title:             s.ex.Title,
		DurationSeconds:   int(s.ex.Duration.Seconds()),
		PassingScore:      s.ex.PassingScore,
		KubernetesVersion: s.ex.KubernetesVersion,
		// Pre-sized (not nil) so an exam with zero questions still
		// marshals Questions as JSON "[]" rather than "null".
		Questions: make([]examQuestionInfo, 0, len(s.ex.Questions)),
	}
	for _, q := range s.ex.Questions {
		resp.Questions = append(resp.Questions, examQuestionInfo{
			ID:          q.ID,
			Instance:    q.Instance,
			Domain:      q.Domain,
			Weight:      q.Weight,
			TotalPoints: totalPoints(q),
		})
	}
	writeJSON(w, http.StatusOK, resp)
}

// totalPoints sums the Points of every check in q that Load did not
// mark Skip (a check with a missing/malformed "# points:" header),
// matching grade.sh's exclusion of such checks from the total.
func totalPoints(q exam.Question) int {
	total := 0
	for _, c := range q.Checks {
		if !c.Skip {
			total += c.Points
		}
	}
	return total
}

// findQuestion looks up a question by id in exam order. The second
// return value is false when id names no question in the loaded exam.
func (s *server) findQuestion(id string) (exam.Question, bool) {
	for _, q := range s.ex.Questions {
		if q.ID == id {
			return q, true
		}
	}
	return exam.Question{}, false
}

// questionResponse is the GET /api/questions/{id} JSON shape.
type questionResponse struct {
	ID       string `json:"id"`
	Instance string `json:"instance"`
	Domain   string `json:"domain"`
	Markdown string `json:"markdown"`
}

func (s *server) handleQuestion(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	q, ok := s.findQuestion(id)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "unknown question "+id)
		return
	}

	md, err := os.ReadFile(filepath.Join(s.bankDir, id, "question.md"))
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, questionResponse{
		ID:       q.ID,
		Instance: q.Instance,
		Domain:   q.Domain,
		Markdown: string(md),
	})
}

// solutionResponse is the GET /api/questions/{id}/solution JSON shape.
type solutionResponse struct {
	ID       string `json:"id"`
	Markdown string `json:"markdown"`
}

func (s *server) handleSolution(w http.ResponseWriter, r *http.Request) {
	// The gate is checked before any question lookup at all (even
	// before validating the id), so a client can't use this endpoint
	// to probe which question ids exist before the session ends —
	// documented UX fidelity with killer.sh, not a security boundary
	// (the bank files sit on the candidate's own disk regardless).
	if s.mgr.Snapshot().State != "ended" {
		writeJSONError(w, http.StatusForbidden, "solutions are available once the session has ended")
		return
	}

	id := r.PathValue("id")
	if _, ok := s.findQuestion(id); !ok {
		writeJSONError(w, http.StatusNotFound, "unknown question "+id)
		return
	}

	md, err := os.ReadFile(filepath.Join(s.bankDir, id, "solution.md"))
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, solutionResponse{ID: id, Markdown: string(md)})
}

// sessionResponse is the shared JSON shape for every endpoint that
// reports session state: GET /api/session, POST /api/session/start,
// and POST /api/session/end.
type sessionResponse struct {
	State            string `json:"state"`
	StartedAt        string `json:"startedAt"`
	DurationSeconds  int    `json:"durationSeconds"`
	RemainingSeconds int    `json:"remainingSeconds"`
	EndReason        string `json:"endReason"`
}

func toSessionResponse(snap session.Snapshot) sessionResponse {
	resp := sessionResponse{
		State:            snap.State,
		DurationSeconds:  snap.DurationSeconds,
		RemainingSeconds: snap.RemainingSeconds,
		EndReason:        snap.EndReason,
	}
	if !snap.StartedAt.IsZero() {
		resp.StartedAt = snap.StartedAt.Format(time.RFC3339Nano)
	}
	return resp
}

func (s *server) handleSessionStart(w http.ResponseWriter, r *http.Request) {
	snap, err := s.mgr.Start()
	if err != nil {
		writeJSONError(w, http.StatusConflict, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, toSessionResponse(snap))
}

func (s *server) handleSessionGet(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, toSessionResponse(s.mgr.Snapshot()))
}

func (s *server) handleSessionEnd(w http.ResponseWriter, r *http.Request) {
	if err := s.mgr.End("submitted"); err != nil {
		writeJSONError(w, http.StatusConflict, err.Error())
		return
	}
	if s.grade != nil {
		s.grade()
	}
	writeJSON(w, http.StatusAccepted, toSessionResponse(s.mgr.Snapshot()))
}

func (s *server) handleSessionDelete(w http.ResponseWriter, r *http.Request) {
	if err := s.mgr.Reset(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// gradingResponse is the GET /api/results body while grading is still
// in flight (202).
type gradingResponse struct {
	State string `json:"state"`
}

func (s *server) handleResults(w http.ResponseWriter, r *http.Request) {
	if s.mgr.Snapshot().State != "ended" {
		writeJSONError(w, http.StatusConflict, "session has not ended")
		return
	}

	results, gradeErr, graded := s.mgr.Results()
	if !graded {
		writeJSON(w, http.StatusAccepted, gradingResponse{State: "grading"})
		return
	}
	if gradeErr != "" {
		writeJSONError(w, http.StatusInternalServerError, gradeErr)
		return
	}

	// results is already the exact JSON payload SetResults was given
	// (evaluate.Results marshaled by the caller); write it verbatim
	// rather than round-tripping it through another Marshal.
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(results)
}

// handleSPA serves the embedded exam UI: a real file from ui if the
// request path names one, otherwise index.html (so client-side routes
// like "/score" that have no matching file still load the app). Paths
// under "/api/" that reached here matched none of the specific /api/*
// patterns registered above, so they are unknown API routes, not SPA
// navigation — those get a JSON 404, never index.html.
func (s *server) handleSPA(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		writeJSONError(w, http.StatusNotFound, "not found")
		return
	}

	upath := strings.TrimPrefix(r.URL.Path, "/")
	if upath == "" {
		upath = "index.html"
	}
	if f, err := s.ui.Open(upath); err == nil {
		f.Close()
		http.FileServer(http.FS(s.ui)).ServeHTTP(w, r)
		return
	}

	index, err := fs.ReadFile(s.ui, "index.html")
	if err != nil {
		http.Error(w, "index.html not found", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(index)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
