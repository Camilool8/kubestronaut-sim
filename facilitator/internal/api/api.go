// Package api wires the facilitator's exam, session, evaluate, and
// desktop packages into the HTTP surface the exam UI (and `./sim
// reset`) talks to: JSON everywhere, errors as {"error":"..."}, exactly
// per the milestone design's §3 HTTP API table.
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

// Grader kicks off an asynchronous grading run. It is invoked by the
// end-session handler (both the initial submit and any ended-without-
// results re-grade) after Manager.End succeeds; the expiry path fires
// the same func from outside this package (main wires session's
// onExpire to it too), so callers must make it safe to invoke from
// multiple goroutines and safe to call more than once in a row.
type Grader func()

// PracticeGrader scores the environment as it stands and returns the
// result without recording it. Backs "score my work now" in training
// mode. Returns an error when a grading run is already in flight.
type PracticeGrader func() (json.RawMessage, error)

// server holds every dependency the HTTP handlers need. It is
// unexported; New is the only way to obtain the http.Handler it backs.
type server struct {
	ex       *exam.Exam
	bankDir  string
	mgr      *session.Manager
	grade    Grader
	desktop  http.Handler
	ui       fs.FS
	boot     *bootstate.Reader
	practice PracticeGrader
	// hist is the durable attempt record and banks the server-side route
	// to the conductor's bank list. Both are optional (see the Option
	// constructors in history.go) and both are nil in every test and dev
	// run that predates them.
	hist  *history.Store
	banks BanksFetcher

	// control is the conductor passthrough, kept as well as mounted:
	// the conductor is unreachable from this process by any other route,
	// and two things about a pooled hands-on bank depend on asking it or
	// on watching what goes through it. See controlProxy and probeSeeded
	// in prepare.go.
	control http.Handler

	// seeder prepares the exam cluster for a pooled hands-on bank's drawn
	// questions, and is nil everywhere else — see WithSeeder in
	// prepare.go. prep/prepError/prepGen are the in-flight preparation
	// that seeder is running and seeded is what the cluster already holds
	// because of an earlier one, all guarded by prepMu; they are the only
	// mutable state this server holds, and they are deliberately not
	// persisted.
	seeder    Seeder
	prepMu    sync.Mutex
	prep      *prep
	prepError string
	prepGen   uint64
	seeded    *seededSet
	probeOnce sync.Once
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
// boot reports the exam environment's start-up progress; the facilitator
// now starts before k8s-env is healthy, so it must be able to say what
// is happening rather than simply refusing to answer. A nil Reader means
// "assume ready", which keeps direct/dev runs and tests that do not care
// about boot from having to construct one.
//
// Everything that arrived after the original nine parameters comes in as
// an Option instead (WithHistory, WithBanks, WithSeeder). A tenth and
// eleventh positional argument would have made every existing call site
// — five test files and main — restate nils they do not care about.
func New(ex *exam.Exam, bankDir string, mgr *session.Manager, grade Grader, desktop, control http.Handler, ui fs.FS, boot *bootstate.Reader, practice PracticeGrader, opts ...Option) http.Handler {
	s := &server{ex: ex, bankDir: bankDir, mgr: mgr, grade: grade, desktop: desktop, control: control, ui: ui, boot: boot, practice: practice}
	for _, opt := range opts {
		opt(s)
	}
	// What the exam cluster is already holding, on the one bank shape
	// where it holds anything: a pooled hands-on attempt seeded its own
	// drawn questions, and a facilitator that restarted would otherwise
	// come back believing the cluster was empty. The persisted draw is
	// read here rather than a second copy being written, which is also
	// why this can be exact without any new on-disk state: an attempt's
	// question ids are the ids its seeding created objects for.
	if s.seedRequired() {
		if ids := mgr.QuestionIDs(); len(ids) > 0 {
			s.seeded = newSeededSet(ids)
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealthz)
	mux.HandleFunc("GET /api/boot", s.handleBoot)
	mux.HandleFunc("GET /api/exam", s.handleExam)
	mux.HandleFunc("GET /api/questions/{id}", s.handleQuestion)
	mux.HandleFunc("GET /api/questions/{id}/solution", s.handleSolution)
	mux.HandleFunc("GET /api/questions/{id}/hints/{n}", s.handleHint)
	// Registered unconditionally (ServeMux patterns are static, like the
	// hints route on a hintless bank); the PUT handler rejects hands-on
	// exams itself.
	mux.HandleFunc("PUT /api/questions/{id}/answer", s.handleAnswerPut)
	mux.HandleFunc("GET /api/answers", s.handleAnswersGet)
	mux.HandleFunc("POST /api/session/start", s.handleSessionStart)
	mux.HandleFunc("PUT /api/session/focus", s.handleSessionFocus)
	mux.HandleFunc("GET /api/session", s.handleSessionGet)
	mux.HandleFunc("POST /api/session/end", s.handleSessionEnd)
	mux.HandleFunc("POST /api/session/grade", s.handlePracticeGrade)
	mux.HandleFunc("GET /api/results", s.handleResults)
	mux.HandleFunc("DELETE /api/session", s.handleSessionDelete)

	// Attempt history and the exam catalog. Registered unconditionally,
	// like the hints route on a hintless bank: ServeMux patterns are
	// static, and a build with no history store answers 503 (the route
	// exists, it has nowhere to write) rather than 404 (this build has
	// never heard of it) — a difference the client can act on.
	//
	// /api/catalog is served HERE and not proxied to the conductor, for
	// two reasons: the conductor cannot see the state volume history
	// lives in, and looking at the exam list must never be able to
	// trigger a rebuild.
	mux.HandleFunc("GET /api/history", s.handleHistoryGet)
	mux.HandleFunc("DELETE /api/history", s.handleHistoryDelete)
	mux.HandleFunc("GET /api/history/summary", s.handleHistorySummary)
	mux.HandleFunc("GET /api/history/export", s.handleHistoryExport)
	mux.HandleFunc("POST /api/history/import", s.handleHistoryImport)
	mux.HandleFunc("GET /api/catalog", s.handleCatalog)

	// Control-plane passthrough to the conductor (reset, bank switch,
	// catalog). The subtree pattern is more specific than "/", so the
	// SPA fallback's /api/* 404 guard is unaffected; the conductor sees
	// the full, unstripped /api/control/... path — its own mux registers
	// the same paths. Wrapped, not mounted bare, so this server can see
	// the one thing passing through it that changes an answer it gives:
	// see controlProxy.
	mux.Handle("/api/control/", s.controlProxy())

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
	Name  string `json:"name"`
	Title string `json:"title"`
	// Certification names the exam this bank rehearses ("CKAD"), where
	// Title names the bank ("CKAD Mock Exam 01"). The mode screen and its
	// header both describe the LOADED exam, so they read it from here
	// rather than from the conductor's catalog — one fetch, and no
	// dependency on having visited the exam selector first.
	Certification     string `json:"certification,omitempty"`
	ExamType          string `json:"examType"`
	DurationSeconds   int    `json:"durationSeconds"`
	PassingScore      int    `json:"passingScore"`
	KubernetesVersion string `json:"kubernetesVersion"`
	// QuestionCount is the exam's declared length — ex.ExamLength for a
	// pooled bank, otherwise len(Questions) — and is what the lobby
	// and the bank-switch cards must show. It is deliberately NOT always
	// len(Questions) below: before an attempt exists there is nothing
	// drawn yet, so Questions still lists the full pool, which for a
	// pooled bank is larger than the exam a candidate will actually get.
	QuestionCount int                `json:"questionCount"`
	Questions     []examQuestionInfo `json:"questions"`
	// Modes the lobby renders its picker from, so the three cards are
	// described by the server rather than hardcoded in the UI.
	Modes []examMode `json:"modes"`
	// Domains is the bank's curriculum, in the order it declares it — the
	// list a draw configurator builds its chips from. Computed from the
	// FULL pool, never from Questions above: once an attempt has started,
	// Questions is that attempt's drawn subset, and counting it by domain
	// would present the drawn questions as if they were the curriculum.
	Domains []domainInfo `json:"domains"`
}

// domainInfo is one curriculum domain of the loaded exam.
//
// WeightPct and QuestionCount are independent numbers and neither
// implies the other: a domain can be worth 44% of the certification and
// hold three questions. The first is what the exam board publishes, the
// second is how much of it this bank has written.
type domainInfo struct {
	Name          string `json:"name"`
	WeightPct     int    `json:"weightPct"`
	QuestionCount int    `json:"questionCount"`
}

// examMode is one selectable attempt mode.
//
// Every boolean here is the behaviour the server will actually enforce,
// read from the same session-package predicate the enforcing handler
// reads. The mode screen renders its capability list ("✓ Grade as you
// go", "– Not recorded as an attempt") straight from these rather than
// restating the rules client-side, where the two would drift.
//
// Labels stay out of this response on purpose. User-facing copy belongs
// in ui/src/strings.ts (AGENTS.md), and a mode's NAME is copy while its
// permissions are facts only the server knows.
type examMode struct {
	ID              string `json:"id"`
	DurationSeconds int    `json:"durationSeconds"`
	Untimed         bool   `json:"untimed"`
	// HelpAllowed: GET /api/questions/{id}/hints/{n} and .../solution
	// answer mid-attempt.
	HelpAllowed bool `json:"helpAllowed"`
	// GradesPerTask: POST /api/session/grade answers mid-attempt.
	GradesPerTask bool `json:"gradesPerTask"`
	// Recorded: a finished attempt in this mode belongs in the attempt
	// history. Nothing reads this until history exists; it is declared
	// here so the mode screen's promise and the recorder's rule are the
	// same statement from the start.
	Recorded bool `json:"recorded"`
	// Recommended: the one card the mode screen accents.
	Recommended bool `json:"recommended"`
}

// examQuestionInfo is one question's entry in the GET /api/exam
// response. TotalPoints is computed here (not stored on exam.Question)
// as the sum of every non-Skip check's Points for hands-on, and is
// simply the weight for mcq. Instance is omitted for mcq questions —
// there is nothing to ssh into. Multi is mcq-only.
type examQuestionInfo struct {
	ID          string `json:"id"`
	Title       string `json:"title,omitempty"`
	Instance    string `json:"instance,omitempty"`
	Domain      string `json:"domain"`
	Weight      int    `json:"weight"`
	TotalPoints int    `json:"totalPoints"`
	HintCount   int    `json:"hintCount"`
	Multi       bool   `json:"multi,omitempty"`
	// TargetSeconds is the question's pacing budget, and TargetDerived
	// says it was computed from the question's share of the exam clock
	// rather than authored in the bank. The pair travels together because
	// they are different claims — an author's judgement of the work
	// versus arithmetic about weights — and a display that cannot tell
	// them apart will state the second with the first's confidence.
	TargetSeconds int  `json:"targetSeconds,omitempty"`
	TargetDerived bool `json:"targetDerived,omitempty"`
}

func (s *server) handleExam(w http.ResponseWriter, r *http.Request) {
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
		// Pre-sized (not nil) so an exam with zero questions still
		// marshals Questions as JSON "[]" rather than "null".
		Questions: make([]examQuestionInfo, 0, len(pool)),
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
	// Each card's advertised clock comes from durationFor — the same
	// function POST /api/session/start resolves the real clock with — so
	// the number on the card is the number the attempt gets, including
	// under SESSION_DURATION_OVERRIDE.
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

// domainInfo lists the loaded exam's curriculum domains in bank order,
// counted over the WHOLE pool (s.ex.Questions) rather than over whatever
// GET /api/exam is currently listing — questionsForExamResponse narrows
// that to the drawn subset once an attempt starts, and a configurator
// built on the narrowed count would show a candidate the questions they
// drew as if they were the entire curriculum.
func (s *server) domainInfo() []domainInfo {
	counts := make(map[string]int, len(s.ex.Domains))
	for _, q := range s.ex.Questions {
		counts[q.Domain]++
	}
	// Pre-sized (not nil) so a bank with no domains marshals as "[]".
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

// declaredQuestionCount is the exam's length as the candidate is meant
// to see it BEFORE an attempt exists to draw one from: ex.ExamLength for
// a pooled bank, otherwise the size of the whole pool. Every display
// site (the lobby stat, the bank-switch cards) wants this, never
// len(s.ex.Questions) directly — that would show the pool's full size on
// a bank where a candidate never sees more than ExamLength of it.
func (s *server) declaredQuestionCount() int {
	// Once an attempt exists, its own draw is the only truthful answer,
	// and it is not always ex.ExamLength: a domain filter can leave a
	// pool too shallow to draw the declared length from, and a filtered
	// hands-on attempt has no declared length at all. Both then report
	// fewer questions than the bank advertises, and this field is the one
	// every count display reads — "Question 1 of 65" on a 12-question
	// drill is the whole screen lying at once.
	if ids := s.mgr.QuestionIDs(); len(ids) > 0 {
		return len(ids)
	}
	if exam.Pooled(s.ex) {
		return s.ex.ExamLength
	}
	return len(s.ex.Questions)
}

// questionsForExamResponse is what GET /api/exam lists under
// "questions": the current attempt's drawn subset, in draw order, once a
// pooled attempt has started (or ended — the score screen's own getExam
// call, if any, sees the same attempt) — and the full pool otherwise,
// which for an unpooled bank of either engine and for the idle window
// before any attempt has been started is exactly the previous,
// pre-pooling behaviour.
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

// findQuestion looks up a question by id in exam order, restricted to
// the current attempt's drawn subset when one exists (a pooled bank once
// an attempt has started) — otherwise (an unpooled bank of either
// engine; the idle window before any attempt) the full pool, exactly as
// before pooling existed. Every endpoint that reads or writes a single
// question by id (GET /api/questions/{id}, its solution and hints, and
// the answer PUT) goes through this, so none of them can be used to
// touch a pool question outside what this attempt actually drew.
// The second return value is false when id names no question at all, or
// names one outside the current subset.
func (s *server) findQuestion(id string) (exam.Question, bool) {
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

// questionResponse is the GET /api/questions/{id} JSON shape. Options
// and Multi are mcq-only; the answer key (exam.Question.Correct) is
// deliberately never part of this response — it reaches the client only
// inside graded results, mirroring the solution.md gate.
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

// solutionResponse is the GET /api/questions/{id}/solution JSON shape.
type solutionResponse struct {
	ID       string `json:"id"`
	Markdown string `json:"markdown"`
	// Docs is the question's upstream reading, in bank order. Omitted
	// entirely when the bank declares none — which is most questions —
	// so the client's optional field is genuinely absent rather than an
	// empty array it has to test the length of.
	Docs []solutionDoc `json:"docs,omitempty"`
}

// solutionDoc is one entry of that list.
type solutionDoc struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

func (s *server) handleSolution(w http.ResponseWriter, r *http.Request) {
	// The gate is checked before any question lookup at all (even
	// before validating the id), so a client can't use this endpoint
	// to probe which question ids exist before the session ends —
	// documented UX fidelity with the real exam, not a security boundary
	// (the bank files sit on the candidate's own disk regardless).
	// Training mode is exactly the mode where reading the solution is
	// the point. Everything else keeps the exam-fidelity gate.
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

// durationFor resolves an attempt's clock from its mode.
//
// SESSION_DURATION_OVERRIDE is applied by main to s.ex.Duration before
// this server is built, so it keeps winning for exam and speed — which
// is what tests/smoke.sh's auto-expiry section relies on. It deliberately
// does NOT reach training: untimed means untimed.
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

// hintResponse is the GET /api/questions/{id}/hints/{n} JSON shape.
type hintResponse struct {
	ID       string `json:"id"`
	Tier     int    `json:"tier"`
	Total    int    `json:"total"`
	Markdown string `json:"markdown"`
}

// handleHint serves ONE hint tier at a time, so revealing the second is
// a deliberate act the candidate takes rather than something the client
// silently already has.
//
// The route is registered unconditionally even though it only ever
// answers in training mode: Go's ServeMux patterns are static, and a
// conditionally-registered route would leak the attempt's mode through
// the difference between 404 and 403.
func (s *server) handleHint(w http.ResponseWriter, r *http.Request) {
	// Gate first, before the id lookup, for the same reason the solution
	// gate does it: the endpoint must not double as a way to enumerate
	// which question ids exist.
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

// answerResponse is the PUT /api/questions/{id}/answer JSON shape.
type answerResponse struct {
	ID       string `json:"id"`
	Selected []int  `json:"selected"`
}

// handleAnswerPut records the candidate's selection for one mcq
// question: an idempotent upsert, called on every option click, with an
// empty selection meaning "deselected everything". The 409-before-404
// ordering matches the solution handler: the endpoint must not double as
// a question-id oracle for whatever state the session is in.
func (s *server) handleAnswerPut(w http.ResponseWriter, r *http.Request) {
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
		// The attempt ended between the state check above and the write
		// (timer expiry, a concurrent submit): a clean 409, not a 500.
		if errors.Is(err, session.ErrConflict) {
			writeJSONError(w, http.StatusConflict, "no attempt is running")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, answerResponse{ID: id, Selected: s.mgr.Answers()[id]})
}

// answersResponse is the GET /api/answers JSON shape.
type answersResponse struct {
	Answers map[string][]int `json:"answers"`
}

// handleAnswersGet returns every stored selection — the bulk read the UI
// hydrates from on mount (resume after a reload or restart) and the
// review reads after grading. It answers in any state (empty when idle)
// and never includes the answer key.
func (s *server) handleAnswersGet(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, answersResponse{Answers: s.mgr.Answers()})
}

// handlePracticeGrade scores the work so far without ending the attempt
// and without recording anything. Training only: in an exam, finding out
// your score mid-attempt is precisely the thing the format withholds.
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

// sessionResponse is the shared JSON shape for every endpoint that
// reports session state: GET /api/session, POST /api/session/start,
// and POST /api/session/end.
type sessionResponse struct {
	State            string `json:"state"`
	Bank             string `json:"bank"`
	StartedAt        string `json:"startedAt"`
	DurationSeconds  int    `json:"durationSeconds"`
	RemainingSeconds int    `json:"remainingSeconds"`
	EndReason        string `json:"endReason"`
	Mode             string `json:"mode"`
	Untimed          bool   `json:"untimed"`
	// ElapsedSeconds is always present, including 0 for an idle session:
	// it is the only figure that describes an UNTIMED attempt's clock,
	// since durationSeconds - remainingSeconds is 0 for training whatever
	// the truth is. Omitting it at 0 would make "just started" and "no
	// such field" the same wire state.
	ElapsedSeconds int `json:"elapsedSeconds"`
	// How this attempt's questions were drawn. Omitted while idle, and on
	// an attempt started by a build that predates seeding.
	Seed         string   `json:"seed,omitempty"`
	PoolDigest   string   `json:"poolDigest,omitempty"`
	DomainFilter []string `json:"domainFilter,omitempty"`
	// Preparing describes an attempt that has been drawn but whose
	// cluster is still being seeded — see handleSessionGet. Absent
	// entirely on every bank that seeds at boot, which is all of them
	// today, and on every mcq bank forever.
	Preparing *preparingInfo `json:"preparing,omitempty"`
	// PrepareError is why the last preparation did not produce an
	// attempt. Set only after a failure, cleared by the next start or by
	// DELETE /api/session.
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

// startResponse is the session shape plus the one fact that belongs to
// the REQUEST rather than to the attempt: whether the pool the caller
// replayed from is still the pool they got. It is reported here and
// nowhere else, and is deliberately not persisted — the attempt itself
// is perfectly ordinary, it just is not the same set of questions the
// seed produced last time.
type startResponse struct {
	sessionResponse
	PoolChanged bool `json:"poolChanged,omitempty"`
}

func (s *server) handleSessionStart(w http.ResponseWriter, r *http.Request) {
	// The facilitator answers long before the cluster is usable now, so
	// this is the gate that stops a candidate starting a 120-minute
	// clock against a half-built environment. Without it, "the UI came
	// up, so I clicked Start" burns real exam time on questions whose
	// seed data does not exist yet.
	//
	// An mcq exam needs none of that — no instances, no seed data, no
	// desktop — so it starts the moment the facilitator can answer,
	// while the cluster finishes booting in the background.
	if s.ex.Type != exam.TypeMCQ && !s.bootState().Ready() {
		writeJSONError(w, http.StatusConflict, "the exam environment is still starting")
		return
	}
	// Body is optional and defaults to an unseeded, unfiltered exam
	// attempt: ./sim and tests/smoke.sh both POST with no body at all,
	// and must keep working unchanged. An empty body decodes as io.EOF,
	// which is why the decode error is tolerated rather than rejected.
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

	// Every attempt draws, on both engines. A pooled bank draws a fresh
	// subset (Reset having cleared the last one, so "New attempt" means a
	// new draw rather than a replay); everything else draws every in-scope
	// question in bank order, which without a domain filter is the whole
	// bank exactly as before. See exam.Draw.
	drawn, err := exam.Draw(s.ex, exam.DrawOptions{Seed: body.Seed, Domains: body.Domains})
	if err != nil {
		// A malformed seed or an unknown domain is the caller's mistake;
		// a pool that cannot satisfy its own domainWeights at this draw
		// size is an authoring bug tests/bank-mcq.sh should have caught
		// long before this ran, and must not be reported as if the
		// candidate had asked for something wrong.
		if errors.Is(err, exam.ErrDrawRequest) {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// A replay whose pool has moved on is started, not refused. The draw
	// is still perfectly deterministic — it is simply no longer the same
	// set — and refusing would leave a candidate holding an old seed with
	// nothing at all rather than with a comparable attempt and a warning.
	poolChanged := body.PoolDigest != "" && body.PoolDigest != drawn.PoolDigest

	draw := session.Draw{
		QuestionIDs:  drawn.IDs,
		Seed:         drawn.Seed,
		PoolDigest:   drawn.PoolDigest,
		DomainFilter: drawn.Domains,
	}

	// A pooled hands-on bank's cluster holds nothing yet: its boot skipped
	// the seed loop precisely so that this draw could decide what to seed
	// (images/k8s-env/bootstrap.sh). The questions have to be created
	// before the attempt is worth sitting, and the clock must not be
	// running while that happens — so the response here is 202 and a job
	// to watch, not a session.
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

// startPrepared answers POST /api/session/start for a pooled hands-on
// bank: it hands the draw to the conductor to seed and replies 202 with
// the job to watch. Nothing here starts a clock — see watchPrepare,
// which does, once and only once the seeding has succeeded.
func (s *server) startPrepared(w http.ResponseWriter, r *http.Request, mode string, draw session.Draw, poolChanged bool) {
	if s.seeder == nil {
		// A build with no route to the conductor cannot prepare this bank's
		// cluster, and starting anyway would hand the candidate a timed
		// attempt against questions that do not exist. Saying so beats
		// scoring them zero for it.
		writeJSONError(w, http.StatusServiceUnavailable,
			"this exam prepares its questions when an attempt starts, and the environment service is not reachable")
		return
	}
	// Checked here as well as inside StartDraw, because on this path
	// StartDraw does not run for another few minutes: without it a start
	// against a running attempt would seed over that attempt's cluster
	// before discovering the conflict.
	if state := s.mgr.Snapshot().State; state != "idle" {
		writeJSONError(w, http.StatusConflict, "session: start: invalid state transition")
		return
	}
	// An idle session is not an empty cluster. The previous attempt's
	// questions are still in there until something rebuilds it, and
	// seeding a different draw on top of them is what checkClusterFree
	// exists to refuse.
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
		// The conductor refused (a control job in flight, a session it can
		// see running) or could not be reached. Either way no attempt has
		// begun and the candidate must be told why.
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

// startRequest is the POST /api/session/start body. Every field is
// optional, including the object itself.
type startRequest struct {
	Mode string `json:"mode"`
	// Seed replays a previous draw; empty mints a fresh one.
	Seed string `json:"seed"`
	// Domains narrows the draw to part of the curriculum. Empty draws
	// from all of it, which is the only kind of attempt a "passed" claim
	// can rest on.
	Domains []string `json:"domains"`
	// PoolDigest is the pool the seed came from, when replaying. Compared
	// against the loaded bank's and reported back, never enforced.
	PoolDigest string `json:"poolDigest"`
}

// handleSessionFocus records which task is on screen. The client reports
// a question id and nothing else — the server owns this clock exactly as
// it owns the countdown — and time accrues to the previously reported
// question when a new report arrives.
//
// It rides the UI's existing session poller, so a lost report costs at
// most one interval, and the 409/404 pair mirrors the answer PUT: the
// state check comes first so the endpoint cannot double as a way to
// enumerate question ids.
func (s *server) handleSessionFocus(w http.ResponseWriter, r *http.Request) {
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
	// findQuestion already restricts to the attempt's drawn subset, which
	// is exactly the right scope: time spent on a pool question this
	// attempt never contained is not a thing that can have happened.
	if _, ok := s.findQuestion(body.Question); !ok {
		writeJSONError(w, http.StatusNotFound, "unknown question "+body.Question)
		return
	}

	if err := s.mgr.Focus(body.Question); err != nil {
		// The attempt ended between the state check and the write.
		if errors.Is(err, session.ErrConflict) {
			writeJSONError(w, http.StatusConflict, "no attempt is running")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// bootState reads the environment's start-up state, treating a nil
// Reader as ready.
func (s *server) bootState() bootstate.State {
	if s.boot == nil {
		return bootstate.State{State: bootstate.StateReady, Phase: "ready"}
	}
	return s.boot.Read()
}

// handleBoot always returns 200 — "the environment is still building" is
// a normal answer to this question, not an error, and the UI polls it on
// a loop while rendering a progress screen.
func (s *server) handleBoot(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.bootState())
}

// handleSessionGet is the poll every client already runs, and is where
// an attempt waiting on its cluster is reported.
//
// `preparing` is attached HERE and on no other endpoint, because this is
// the one a client polls: the terminal condition for a 202 from
// /api/session/start is `preparing` disappearing from this response, at
// which point `state` is "running" (it worked) or "idle" with
// `prepareError` set (it did not). Deliberately not a fourth `state`
// value — the session genuinely is idle until the clock starts, and
// every client that has never heard of pooling keeps reading a response
// that is true.
func (s *server) handleSessionGet(w http.ResponseWriter, r *http.Request) {
	// The one place a lost preparation can be noticed, for the same
	// reason `preparing` is reported here and nowhere else: this is the
	// endpoint a client polls. It never blocks this response — the answer
	// lands in prepareError and rides the next poll a second later.
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

// handleSessionDelete returns the session to idle from any state — and
// abandons any preparation in flight, which is the same statement about
// an attempt that has not started its clock yet. Without that, a reset
// during preparation would be followed minutes later by the watcher
// starting the very attempt the reset just cancelled.
func (s *server) handleSessionDelete(w http.ResponseWriter, r *http.Request) {
	s.cancelPrep()
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
