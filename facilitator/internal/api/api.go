package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"kubestronaut-sim/facilitator/internal/bootstate"
	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/history"
	"kubestronaut-sim/facilitator/internal/session"
)

type Grader func()

type PracticeGrader func() (json.RawMessage, error)

type server struct {
	ex       *exam.Exam
	bankDir  string
	mgr      *session.Manager
	grade    Grader
	desktop  http.Handler
	ui       fs.FS
	boot     *bootstate.Reader
	practice PracticeGrader

	hist  *history.Store
	banks BanksFetcher

	control http.Handler

	seeder    Seeder
	prepMu    sync.Mutex
	prep      *prep
	prepError string
	prepGen   uint64
	seeded    *seededSet
	probeOnce sync.Once
}

func New(ex *exam.Exam, bankDir string, mgr *session.Manager, grade Grader, desktop, control http.Handler, ui fs.FS, boot *bootstate.Reader, practice PracticeGrader, opts ...Option) http.Handler {
	s := &server{ex: ex, bankDir: bankDir, mgr: mgr, grade: grade, desktop: desktop, control: control, ui: ui, boot: boot, practice: practice}
	for _, opt := range opts {
		opt(s)
	}

	if s.seedRequired() {
		if ids := mgr.QuestionIDs(); len(ids) > 0 {
			s.seeded = newSeededSet(ids)
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealthz)
	mux.HandleFunc("GET /api/boot", s.handleBoot)
	mux.HandleFunc("GET /api/exam", s.handleExam)

	mux.HandleFunc("GET /api/exam/tips", s.handleExamTips)
	mux.HandleFunc("GET /api/questions/{id}", s.handleQuestion)
	mux.HandleFunc("GET /api/questions/{id}/solution", s.handleSolution)
	mux.HandleFunc("GET /api/questions/{id}/hints/{n}", s.handleHint)

	mux.HandleFunc("PUT /api/questions/{id}/answer", s.handleAnswerPut)
	mux.HandleFunc("GET /api/answers", s.handleAnswersGet)
	mux.HandleFunc("POST /api/session/start", s.handleSessionStart)
	mux.HandleFunc("PUT /api/session/focus", s.handleSessionFocus)
	mux.HandleFunc("GET /api/session", s.handleSessionGet)
	mux.HandleFunc("POST /api/session/end", s.handleSessionEnd)
	mux.HandleFunc("POST /api/session/grade", s.handlePracticeGrade)
	mux.HandleFunc("GET /api/results", s.handleResults)
	mux.HandleFunc("DELETE /api/session", s.handleSessionDelete)

	mux.HandleFunc("GET /api/history", s.handleHistoryGet)
	mux.HandleFunc("DELETE /api/history", s.handleHistoryDelete)
	mux.HandleFunc("GET /api/history/summary", s.handleHistorySummary)
	mux.HandleFunc("GET /api/history/export", s.handleHistoryExport)
	mux.HandleFunc("POST /api/history/import", s.handleHistoryImport)
	mux.HandleFunc("GET /api/catalog", s.handleCatalog)

	mux.Handle("/api/control/", s.controlProxy())

	mux.Handle("/desktop", desktop)
	mux.Handle("/desktop/", desktop)

	mux.HandleFunc("/", s.handleSPA)

	return mux
}

func handleHealthz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

type examResponse struct {
	Name  string `json:"name"`
	Title string `json:"title"`

	Certification     string `json:"certification,omitempty"`
	ExamType          string `json:"examType"`
	DurationSeconds   int    `json:"durationSeconds"`
	PassingScore      int    `json:"passingScore"`
	KubernetesVersion string `json:"kubernetesVersion"`

	QuestionCount int                `json:"questionCount"`
	Questions     []examQuestionInfo `json:"questions"`

	Environment *environmentInfo `json:"environment,omitempty"`

	Modes []examMode `json:"modes"`

	Domains []domainInfo `json:"domains"`

	HasTips bool `json:"hasTips,omitempty"`

	// Whether the draw is stratified by level as well as by domain. The
	// per-question tier deliberately stays server-side: it shapes the
	// draw, it is not something to brace a candidate with mid-attempt.
	LevelMixed bool `json:"levelMixed,omitempty"`
}

type environmentInfo struct {
	Provider string `json:"provider,omitempty"`
	Nodes    int    `json:"nodes,omitempty"`
}

type domainInfo struct {
	Name          string `json:"name"`
	WeightPct     int    `json:"weightPct"`
	QuestionCount int    `json:"questionCount"`
}

type examMode struct {
	ID              string `json:"id"`
	DurationSeconds int    `json:"durationSeconds"`
	Untimed         bool   `json:"untimed"`

	HelpAllowed bool `json:"helpAllowed"`

	GradesPerTask bool `json:"gradesPerTask"`

	Recorded bool `json:"recorded"`

	Recommended bool `json:"recommended"`
}

type examQuestionInfo struct {
	ID          string `json:"id"`
	Title       string `json:"title,omitempty"`
	Instance    string `json:"instance,omitempty"`
	Domain      string `json:"domain"`
	Weight      int    `json:"weight"`
	TotalPoints int    `json:"totalPoints"`
	HintCount   int    `json:"hintCount"`
	Multi       bool   `json:"multi,omitempty"`

	TargetSeconds int  `json:"targetSeconds,omitempty"`
	TargetDerived bool `json:"targetDerived,omitempty"`
}

func (s *server) handleExam(w http.ResponseWriter, r *http.Request) {
	if !s.requireExam(w) {
		return
	}
	pool := s.questionsForExamResponse()
	resp := examResponse{
		Name:              s.ex.Name,
		Title:             s.ex.Title,
		Certification:     s.ex.Certification,
		ExamType:          s.ex.Type,
		DurationSeconds:   int(s.ex.Duration.Seconds()),
		PassingScore:      s.ex.PassingScore,
		KubernetesVersion: s.ex.KubernetesVersion,
		QuestionCount:     s.declaredQuestionCount(),
		HasTips:           s.ex.HasTips,
		LevelMixed:        len(s.ex.DifficultyMix) > 0,

		Questions: make([]examQuestionInfo, 0, len(pool)),
	}
	if env := s.ex.Environment; env.Provider != "" || env.Nodes > 0 {
		resp.Environment = &environmentInfo{Provider: env.Provider, Nodes: env.Nodes}
	}
	for _, q := range pool {
		info := examQuestionInfo{
			ID:        q.ID,
			Title:     q.Title,
			Instance:  q.Instance,
			Domain:    q.Domain,
			Weight:    q.Weight,
			HintCount: q.HintCount,
			Multi:     q.Multi,
		}
		info.TargetSeconds, info.TargetDerived = exam.TargetSeconds(s.ex, q)
		if s.ex.Type == exam.TypeMCQ {
			info.TotalPoints = q.Weight
		} else {
			info.TotalPoints = totalPoints(q)
		}
		resp.Questions = append(resp.Questions, info)
	}
	resp.Domains = s.domainInfo()

	resp.Modes = make([]examMode, 0, 3)
	for _, mode := range session.Modes() {
		d := s.durationFor(mode)
		resp.Modes = append(resp.Modes, examMode{
			ID:              mode,
			DurationSeconds: int(d.Seconds()),
			Untimed:         d == 0,
			HelpAllowed:     session.HelpAllowed(mode),
			GradesPerTask:   session.GradesPerTask(mode),
			Recorded:        session.Recorded(mode),
			Recommended:     session.Recommended(mode),
		})
	}
	writeJSON(w, http.StatusOK, resp)
}

type tipsResponse struct {
	Markdown string `json:"markdown"`
}

func (s *server) handleExamTips(w http.ResponseWriter, r *http.Request) {
	if !s.requireExam(w) {
		return
	}
	md, err := os.ReadFile(exam.TipsPath(s.bankDir))
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "this exam ships no tips")
		return
	}
	writeJSON(w, http.StatusOK, tipsResponse{Markdown: string(md)})
}

func totalPoints(q exam.Question) int {
	total := 0
	for _, c := range q.Checks {
		if !c.Skip {
			total += c.Points
		}
	}
	return total
}

func (s *server) domainInfo() []domainInfo {
	counts := make(map[string]int, len(s.ex.Domains))
	for _, q := range s.ex.Questions {
		counts[q.Domain]++
	}

	out := make([]domainInfo, 0, len(s.ex.Domains))
	for _, d := range s.ex.Domains {
		out = append(out, domainInfo{
			Name:          d.Name,
			WeightPct:     d.WeightPct,
			QuestionCount: counts[d.Name],
		})
	}
	return out
}

func (s *server) declaredQuestionCount() int {

	if ids := s.mgr.QuestionIDs(); len(ids) > 0 {
		return len(ids)
	}
	if exam.Pooled(s.ex) {
		return s.ex.ExamLength
	}
	return len(s.ex.Questions)
}

func (s *server) questionsForExamResponse() []exam.Question {
	ids := s.mgr.QuestionIDs()
	if len(ids) == 0 {
		return s.ex.Questions
	}
	out := make([]exam.Question, 0, len(ids))
	for _, id := range ids {
		if q, ok := s.findQuestion(id); ok {
			out = append(out, q)
		}
	}
	return out
}

func (s *server) findQuestion(id string) (exam.Question, bool) {

	if s.ex == nil {
		return exam.Question{}, false
	}
	if ids := s.mgr.QuestionIDs(); len(ids) > 0 {
		inSubset := false
		for _, want := range ids {
			if want == id {
				inSubset = true
				break
			}
		}
		if !inSubset {
			return exam.Question{}, false
		}
	}
	for _, q := range s.ex.Questions {
		if q.ID == id {
			return q, true
		}
	}
	return exam.Question{}, false
}

type questionResponse struct {
	ID       string   `json:"id"`
	Title    string   `json:"title,omitempty"`
	Instance string   `json:"instance,omitempty"`
	Domain   string   `json:"domain"`
	Markdown string   `json:"markdown"`
	Options  []string `json:"options,omitempty"`
	Multi    bool     `json:"multi,omitempty"`
}

func (s *server) handleQuestion(w http.ResponseWriter, r *http.Request) {
	if !s.requireExam(w) {
		return
	}
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
		Title:    q.Title,
		Instance: q.Instance,
		Domain:   q.Domain,
		Markdown: string(md),
		Options:  q.Options,
		Multi:    q.Multi,
	})
}

type solutionResponse struct {
	ID       string `json:"id"`
	Markdown string `json:"markdown"`

	Docs []solutionDoc `json:"docs,omitempty"`
}

type solutionDoc struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

func (s *server) handleSolution(w http.ResponseWriter, r *http.Request) {

	snap := s.mgr.Snapshot()
	if snap.State != "ended" && !session.HelpAllowed(snap.Mode) {
		writeJSONError(w, http.StatusForbidden, "solutions are available once the session has ended")
		return
	}

	id := r.PathValue("id")
	q, ok := s.findQuestion(id)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "unknown question "+id)
		return
	}

	md, err := os.ReadFile(filepath.Join(s.bankDir, id, "solution.md"))
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := solutionResponse{ID: id, Markdown: string(md)}
	for _, d := range q.Docs {
		resp.Docs = append(resp.Docs, solutionDoc{Label: d.Label, URL: d.URL})
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) durationFor(mode string) time.Duration {
	switch mode {
	case session.ModeTraining:
		return 0
	case session.ModeSpeed:
		return s.ex.SpeedDuration
	default:
		return s.ex.Duration
	}
}

type hintResponse struct {
	ID       string `json:"id"`
	Tier     int    `json:"tier"`
	Total    int    `json:"total"`
	Markdown string `json:"markdown"`
}

func (s *server) handleHint(w http.ResponseWriter, r *http.Request) {

	snap := s.mgr.Snapshot()
	if !session.HelpAllowed(snap.Mode) {
		writeJSONError(w, http.StatusForbidden, "hints are available in Training mode only")
		return
	}
	if snap.State == "idle" {
		writeJSONError(w, http.StatusForbidden, "no attempt is running")
		return
	}

	id := r.PathValue("id")
	q, ok := s.findQuestion(id)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "unknown question "+id)
		return
	}

	tier, err := strconv.Atoi(r.PathValue("n"))
	if err != nil || tier < 1 || tier > q.HintCount {
		writeJSONError(w, http.StatusNotFound, "no such hint")
		return
	}

	raw, err := os.ReadFile(exam.HintsPath(s.bankDir, id))
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tiers := exam.SplitHints(raw)
	if tier > len(tiers) {
		writeJSONError(w, http.StatusNotFound, "no such hint")
		return
	}

	writeJSON(w, http.StatusOK, hintResponse{
		ID: id, Tier: tier, Total: len(tiers), Markdown: tiers[tier-1],
	})
}

type answerResponse struct {
	ID       string `json:"id"`
	Selected []int  `json:"selected"`
}

func (s *server) handleAnswerPut(w http.ResponseWriter, r *http.Request) {
	if !s.requireExam(w) {
		return
	}
	if s.ex.Type != exam.TypeMCQ {
		writeJSONError(w, http.StatusBadRequest, "not a multiple-choice exam")
		return
	}
	if s.mgr.Snapshot().State != "running" {
		writeJSONError(w, http.StatusConflict, "no attempt is running")
		return
	}

	id := r.PathValue("id")
	q, ok := s.findQuestion(id)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "unknown question "+id)
		return
	}

	var body struct {
		Selected []int `json:"selected"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "body must be JSON: {\"selected\":[...]}")
		return
	}
	seen := make(map[int]bool, len(body.Selected))
	for _, n := range body.Selected {
		if n < 0 || n >= len(q.Options) {
			writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("selected index %d is out of range", n))
			return
		}
		if seen[n] {
			writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("selected index %d appears twice", n))
			return
		}
		seen[n] = true
	}
	if !q.Multi && len(body.Selected) > 1 {
		writeJSONError(w, http.StatusBadRequest, id+" takes a single answer")
		return
	}

	if err := s.mgr.SetAnswer(id, body.Selected); err != nil {

		if errors.Is(err, session.ErrConflict) {
			writeJSONError(w, http.StatusConflict, "no attempt is running")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, answerResponse{ID: id, Selected: s.mgr.Answers()[id]})
}

type answersResponse struct {
	Answers map[string][]int `json:"answers"`
}

func (s *server) handleAnswersGet(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, answersResponse{Answers: s.mgr.Answers()})
}

func (s *server) handlePracticeGrade(w http.ResponseWriter, r *http.Request) {
	snap := s.mgr.Snapshot()
	if !session.GradesPerTask(snap.Mode) {
		writeJSONError(w, http.StatusForbidden, "scoring mid-attempt is available in Training mode only")
		return
	}
	if snap.State != "running" {
		writeJSONError(w, http.StatusConflict, "no attempt is running")
		return
	}
	if s.practice == nil {
		writeJSONError(w, http.StatusNotImplemented, "practice grading is not available")
		return
	}

	raw, err := s.practice()
	if err != nil {
		writeJSONError(w, http.StatusConflict, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(raw)
}

type sessionResponse struct {
	State            string `json:"state"`
	Bank             string `json:"bank"`
	StartedAt        string `json:"startedAt"`
	DurationSeconds  int    `json:"durationSeconds"`
	RemainingSeconds int    `json:"remainingSeconds"`
	EndReason        string `json:"endReason"`
	Mode             string `json:"mode"`
	Untimed          bool   `json:"untimed"`

	ElapsedSeconds int `json:"elapsedSeconds"`

	Seed         string   `json:"seed,omitempty"`
	PoolDigest   string   `json:"poolDigest,omitempty"`
	DomainFilter []string `json:"domainFilter,omitempty"`

	Preparing *preparingInfo `json:"preparing,omitempty"`

	PrepareError string `json:"prepareError,omitempty"`
}

func toSessionResponse(snap session.Snapshot) sessionResponse {
	resp := sessionResponse{
		State:            snap.State,
		Bank:             snap.Bank,
		DurationSeconds:  snap.DurationSeconds,
		RemainingSeconds: snap.RemainingSeconds,
		EndReason:        snap.EndReason,
		Mode:             snap.Mode,
		Untimed:          snap.Untimed,
		ElapsedSeconds:   snap.ElapsedSeconds,
		Seed:             snap.Seed,
		PoolDigest:       snap.PoolDigest,
		DomainFilter:     snap.DomainFilter,
	}
	if !snap.StartedAt.IsZero() {
		resp.StartedAt = snap.StartedAt.Format(time.RFC3339Nano)
	}
	return resp
}

type startResponse struct {
	sessionResponse
	PoolChanged bool `json:"poolChanged,omitempty"`
}

func (s *server) handleSessionStart(w http.ResponseWriter, r *http.Request) {
	if !s.requireExam(w) {
		return
	}

	if s.ex.Type != exam.TypeMCQ && !s.bootState().Ready() {
		writeJSONError(w, http.StatusConflict, "the exam environment is still starting")
		return
	}

	if s.ex.Type != exam.TypeMCQ && touchOnly(r) {
		writeJSONErrorCode(w, http.StatusConflict, codeDesktopRequired,
			"this exam runs a Linux desktop beside the questions, so it needs a desktop browser and a keyboard")
		return
	}

	body := startRequest{Mode: session.ModeExam}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		writeJSONError(w, http.StatusBadRequest, "body must be JSON: {\"mode\":...}")
		return
	}
	if body.Mode == "" {
		body.Mode = session.ModeExam
	}
	if !session.ValidMode(body.Mode) {
		writeJSONError(w, http.StatusBadRequest, "unknown mode "+body.Mode)
		return
	}

	drawn, err := exam.Draw(s.ex, exam.DrawOptions{Seed: body.Seed, Domains: body.Domains})
	if err != nil {

		if errors.Is(err, exam.ErrDrawRequest) {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	poolChanged := body.PoolDigest != "" && body.PoolDigest != drawn.PoolDigest

	draw := session.Draw{
		QuestionIDs:  drawn.IDs,
		Seed:         drawn.Seed,
		PoolDigest:   drawn.PoolDigest,
		DomainFilter: drawn.Domains,
	}

	if s.seedRequired() {
		s.startPrepared(w, r, body.Mode, draw, poolChanged)
		return
	}

	snap, err := s.mgr.StartDraw(body.Mode, s.durationFor(body.Mode), draw)
	if err != nil {
		writeJSONError(w, http.StatusConflict, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, startResponse{
		sessionResponse: toSessionResponse(snap),
		PoolChanged:     poolChanged,
	})
}

func (s *server) startPrepared(w http.ResponseWriter, r *http.Request, mode string, draw session.Draw, poolChanged bool) {
	if s.seeder == nil {

		writeJSONError(w, http.StatusServiceUnavailable,
			"this exam prepares its questions when an attempt starts, and the environment service is not reachable")
		return
	}

	if state := s.mgr.Snapshot().State; state != "idle" {
		writeJSONError(w, http.StatusConflict, "session: start: invalid state transition")
		return
	}

	if err := s.checkClusterFree(draw.QuestionIDs); err != nil {
		writeJSONError(w, http.StatusConflict, err.Error())
		return
	}

	p, err := s.beginPrepare(r.Context(), mode, s.durationFor(mode), draw)
	if err != nil {
		if errors.Is(err, errPreparing) || errors.Is(err, errPreparingCancelled) {
			writeJSONError(w, http.StatusConflict, err.Error())
			return
		}

		writeJSONError(w, http.StatusConflict, "the exam environment could not be prepared: "+err.Error())
		return
	}

	writeJSON(w, http.StatusAccepted, prepareResponse{
		State:         "preparing",
		Bank:          s.mgr.Snapshot().Bank,
		Mode:          p.mode,
		JobID:         p.jobID,
		QuestionCount: len(p.draw.QuestionIDs),
		Seed:          p.draw.Seed,
		PoolDigest:    p.draw.PoolDigest,
		DomainFilter:  p.draw.DomainFilter,
		PoolChanged:   poolChanged,
	})
}

type startRequest struct {
	Mode string `json:"mode"`

	Seed string `json:"seed"`

	Domains []string `json:"domains"`

	PoolDigest string `json:"poolDigest"`
}

func (s *server) handleSessionFocus(w http.ResponseWriter, r *http.Request) {
	if !s.requireExam(w) {
		return
	}
	if s.mgr.Snapshot().State != "running" {
		writeJSONError(w, http.StatusConflict, "no attempt is running")
		return
	}

	var body struct {
		Question string `json:"question"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Question == "" {
		writeJSONError(w, http.StatusBadRequest, "body must be JSON: {\"question\":\"q01\"}")
		return
	}

	if _, ok := s.findQuestion(body.Question); !ok {
		writeJSONError(w, http.StatusNotFound, "unknown question "+body.Question)
		return
	}

	if err := s.mgr.Focus(body.Question); err != nil {

		if errors.Is(err, session.ErrConflict) {
			writeJSONError(w, http.StatusConflict, "no attempt is running")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *server) bootState() bootstate.State {
	if s.boot == nil {
		return bootstate.State{State: bootstate.StateReady, Phase: "ready"}
	}
	return s.boot.Read()
}

func (s *server) handleBoot(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.bootState())
}

func (s *server) handleSessionGet(w http.ResponseWriter, r *http.Request) {

	s.startSeedProbe()

	resp := toSessionResponse(s.mgr.Snapshot())
	resp.Preparing, resp.PrepareError = s.prepSnapshot()
	writeJSON(w, http.StatusOK, resp)
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
	s.cancelPrep()
	if err := s.mgr.Reset(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

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

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(results)
}

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

func writeJSONErrorCode(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{"error": msg, "code": code})
}
