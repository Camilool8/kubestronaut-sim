package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"kubestronaut-sim/facilitator/internal/api"
	"kubestronaut-sim/facilitator/internal/bootstate"
	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/session"
)

const (
	examJSON = "testdata/exam.json"
	bankDir  = "testdata/bank"
)

var epoch = time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

// fakeClock returns a clock func() time.Time backed by a mutable
// variable, matching the pattern the session package's own tests use.
func fakeClock(start time.Time) (clock func() time.Time, set func(time.Time)) {
	now := start
	return func() time.Time { return now }, func(t time.Time) { now = t }
}

// fakeGrader is the api.Grader test double: it just counts invocations
// so tests can assert exactly when the API layer kicks grading, without
// running any real evaluate.Grade / ssh machinery.
type fakeGrader struct {
	calls int
}

func (g *fakeGrader) Grade() { g.calls++ }

// fakeDesktop proves that api.New mounts the desktop handler so it
// still sees the ORIGINAL, unstripped request path (api.New must not
// strip "/desktop" itself — that's the desktop package's own job) by
// echoing the path back with a status code (418) no other handler in
// this package ever uses.
var fakeDesktop = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusTeapot)
	w.Write([]byte("desktop:" + r.URL.Path))
})

// testServer bundles a freshly constructed api.New handler with the
// pieces tests need to drive it: the session manager (to force state
// transitions the HTTP surface can't reach directly, like SetResults),
// the fake grader (to assert grading was kicked), and the fake clock's
// setter (for tests that care about elapsed time).
type testServer struct {
	handler http.Handler
	mgr     *session.Manager
	grader  *fakeGrader
	setNow  func(time.Time)
}

func newTestServer(t *testing.T) *testServer {
	t.Helper()

	ex, err := exam.Load(examJSON, bankDir)
	if err != nil {
		t.Fatalf("exam.Load: %v", err)
	}

	clock, setNow := fakeClock(epoch)
	mgr, err := session.New(t.TempDir()+"/session.json", ex.Name, ex.Duration, clock, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}

	grader := &fakeGrader{}
	ui := fstest.MapFS{
		"index.html":    &fstest.MapFile{Data: []byte("<html>ui placeholder</html>")},
		"assets/app.js": &fstest.MapFile{Data: []byte("console.log('hi');")},
	}

	// nil boot reader == "assume ready", which is what every test below
	// other than the boot-gate ones wants.
	h := api.New(ex, bankDir, mgr, grader.Grade, fakeDesktop, fakeControl, ui, nil, nil)
	return &testServer{handler: h, mgr: mgr, grader: grader, setNow: setNow}
}

// newBootingTestServer is newTestServer with a boot reader pointed at
// paths that do not exist, i.e. an environment that has not finished
// starting.
func newBootingTestServer(t *testing.T) *testServer {
	t.Helper()

	ex, err := exam.Load(examJSON, bankDir)
	if err != nil {
		t.Fatalf("exam.Load: %v", err)
	}
	clock, setNow := fakeClock(epoch)
	mgr, err := session.New(t.TempDir()+"/session.json", ex.Name, ex.Duration, clock, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}
	grader := &fakeGrader{}
	dir := t.TempDir()
	boot := bootstate.New(dir+"/boot.json", dir+"/ready")

	h := api.New(ex, bankDir, mgr, grader.Grade, fakeDesktop, fakeControl, fstest.MapFS{}, boot, nil)
	return &testServer{handler: h, mgr: mgr, grader: grader, setNow: setNow}
}

// fakeControl proves that api.New mounts the conductor proxy under
// /api/control/ with unstripped paths.
var fakeControl = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusAccepted)
	w.Write([]byte("control:" + r.URL.Path))
})

func (ts *testServer) do(t *testing.T, method, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	rec := httptest.NewRecorder()
	ts.handler.ServeHTTP(rec, req)
	return rec
}

func decodeJSON[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.NewDecoder(rec.Body).Decode(&v); err != nil {
		t.Fatalf("decode JSON body %q: %v", rec.Body.String(), err)
	}
	return v
}

func TestHealthz(t *testing.T) {
	ts := newTestServer(t)
	rec := ts.do(t, http.MethodGet, "/healthz")

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
	if got := rec.Body.String(); got != "ok" {
		t.Errorf("body = %q, want %q", got, "ok")
	}
}

type examResponse struct {
	Name              string `json:"name"`
	Title             string `json:"title"`
	Certification     string `json:"certification"`
	DurationSeconds   int    `json:"durationSeconds"`
	PassingScore      int    `json:"passingScore"`
	KubernetesVersion string `json:"kubernetesVersion"`
	QuestionCount     int    `json:"questionCount"`
	Questions         []struct {
		ID            string `json:"id"`
		Instance      string `json:"instance"`
		Domain        string `json:"domain"`
		Weight        int    `json:"weight"`
		TotalPoints   int    `json:"totalPoints"`
		TargetSeconds int    `json:"targetSeconds"`
		TargetDerived bool   `json:"targetDerived"`
	} `json:"questions"`
	Domains []struct {
		Name          string `json:"name"`
		WeightPct     int    `json:"weightPct"`
		QuestionCount int    `json:"questionCount"`
	} `json:"domains"`
	Environment *struct {
		Provider string `json:"provider"`
		Nodes    int    `json:"nodes"`
	} `json:"environment"`
}

func TestExam(t *testing.T) {
	ts := newTestServer(t)
	rec := ts.do(t, http.MethodGet, "/api/exam")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[examResponse](t, rec)

	if got.Name != "test-bank" {
		t.Errorf("Name = %q, want %q", got.Name, "test-bank")
	}
	if got.Title != "Test Exam" {
		t.Errorf("Title = %q, want %q", got.Title, "Test Exam")
	}
	// Distinct from Title, and the mode screen's header reads it: a bank
	// names both the certification it rehearses and its own edition.
	if got.Certification != "TEST" {
		t.Errorf("Certification = %q, want %q", got.Certification, "TEST")
	}
	if got.DurationSeconds != 600 {
		t.Errorf("DurationSeconds = %d, want 600", got.DurationSeconds)
	}
	if got.PassingScore != 50 {
		t.Errorf("PassingScore = %d, want 50", got.PassingScore)
	}
	if got.KubernetesVersion != "1.30" {
		t.Errorf("KubernetesVersion = %q, want %q", got.KubernetesVersion, "1.30")
	}
	// The shape of the cluster this bank is sat in — the same
	// spec.environment.nodes bootstrap.sh generates the kind config from.
	// It is here so the screens that describe an environment while it is
	// being built can describe THIS one instead of asserting CKAD's two
	// nodes at a candidate sitting something else. The fixture says three
	// precisely so a hardcoded default cannot pass.
	if got.Environment == nil {
		t.Errorf("Environment absent; the bank declares one")
	} else if got.Environment.Provider != "kind" || got.Environment.Nodes != 3 {
		t.Errorf("Environment = %+v, want provider=kind nodes=3", *got.Environment)
	}
	if len(got.Questions) != 2 {
		t.Fatalf("len(Questions) = %d, want 2", len(got.Questions))
	}
	if got.QuestionCount != 2 {
		t.Errorf("QuestionCount = %d, want 2 (no pooling — mirrors len(Questions))", got.QuestionCount)
	}

	q01, q02 := got.Questions[0], got.Questions[1]
	if q01.ID != "q01" || q01.Instance != "inst-1" || q01.Domain != "Domain One" || q01.Weight != 5 {
		t.Errorf("Questions[0] = %+v, want id=q01 instance=inst-1 domain=%q weight=5", q01, "Domain One")
	}
	if q01.TotalPoints != 5 {
		t.Errorf("q01.TotalPoints = %d, want 5 (3+2 non-skip checks)", q01.TotalPoints)
	}
	if q02.ID != "q02" {
		t.Errorf("Questions[1].ID = %q, want q02", q02.ID)
	}
	if q02.TotalPoints != 4 {
		t.Errorf("q02.TotalPoints = %d, want 4 (only the 4-pt check counts; the bad-points check is skipped)", q02.TotalPoints)
	}
}

type questionResponse struct {
	ID       string `json:"id"`
	Instance string `json:"instance"`
	Domain   string `json:"domain"`
	Markdown string `json:"markdown"`
}

func TestQuestionMarkdown(t *testing.T) {
	ts := newTestServer(t)
	rec := ts.do(t, http.MethodGet, "/api/questions/q01")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[questionResponse](t, rec)

	if got.ID != "q01" {
		t.Errorf("ID = %q, want q01", got.ID)
	}
	if got.Instance != "inst-1" {
		t.Errorf("Instance = %q, want inst-1", got.Instance)
	}
	if got.Domain != "Domain One" {
		t.Errorf("Domain = %q, want %q", got.Domain, "Domain One")
	}
	wantMD := "# Q01\n\nDo the thing on inst-1.\n"
	if got.Markdown != wantMD {
		t.Errorf("Markdown = %q, want %q (raw question.md round-trip)", got.Markdown, wantMD)
	}
}

func TestQuestionUnknown(t *testing.T) {
	ts := newTestServer(t)
	rec := ts.do(t, http.MethodGet, "/api/questions/q99")

	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404, body=%s", rec.Code, rec.Body.String())
	}
}

type solutionResponse struct {
	ID       string `json:"id"`
	Markdown string `json:"markdown"`
	Docs     []struct {
		Label string `json:"label"`
		URL   string `json:"url"`
	} `json:"docs"`
}

func TestSolutionGatedWhileIdle(t *testing.T) {
	ts := newTestServer(t)
	rec := ts.do(t, http.MethodGet, "/api/questions/q01/solution")

	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403 (idle), body=%s", rec.Code, rec.Body.String())
	}
}

func TestSolutionGatedWhileRunning(t *testing.T) {
	ts := newTestServer(t)
	if _, err := ts.mgr.Start(session.ModeExam, time.Hour); err != nil {
		t.Fatalf("Start: %v", err)
	}
	rec := ts.do(t, http.MethodGet, "/api/questions/q01/solution")

	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403 (running), body=%s", rec.Code, rec.Body.String())
	}
}

func TestSolutionGatingPrecedesUnknownID(t *testing.T) {
	// While idle, even a nonexistent question id must 403, not 404 —
	// the gate is checked before any question lookup, so an
	// unauthenticated client can't use the solution endpoint to probe
	// which question ids exist before the session ends.
	ts := newTestServer(t)
	rec := ts.do(t, http.MethodGet, "/api/questions/q99/solution")

	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403 (idle, unknown id), body=%s", rec.Code, rec.Body.String())
	}
}

func TestSolutionAvailableAfterEnd(t *testing.T) {
	ts := newTestServer(t)
	if _, err := ts.mgr.Start(session.ModeExam, time.Hour); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := ts.mgr.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}

	rec := ts.do(t, http.MethodGet, "/api/questions/q01/solution")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (ended), body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[solutionResponse](t, rec)
	if got.ID != "q01" {
		t.Errorf("ID = %q, want q01", got.ID)
	}
	wantMD := "# Solution Q01\n\nDo it like this.\n"
	if got.Markdown != wantMD {
		t.Errorf("Markdown = %q, want %q (raw solution.md round-trip)", got.Markdown, wantMD)
	}

	// Unknown id after ended: now that the gate is open, the lookup
	// falls through to the ordinary 404.
	rec2 := ts.do(t, http.MethodGet, "/api/questions/q99/solution")
	if rec2.Code != http.StatusNotFound {
		t.Errorf("unknown id after ended: status = %d, want 404, body=%s", rec2.Code, rec2.Body.String())
	}
}

// The deep dive's footer reading. The fixture's q01 declares two links,
// one of them unusable, so this covers the whole path at once: the bank
// loaded despite the bad entry, and only the good one reaches the wire.
func TestSolutionCarriesDocs(t *testing.T) {
	ts := newTestServer(t)
	if _, err := ts.mgr.Start(session.ModeExam, time.Hour); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := ts.mgr.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}

	rec := ts.do(t, http.MethodGet, "/api/questions/q01/solution")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[solutionResponse](t, rec)
	if len(got.Docs) != 1 {
		t.Fatalf("Docs = %+v, want exactly the one usable entry", got.Docs)
	}
	if got.Docs[0].Label != "Ingress path types" {
		t.Errorf("Docs[0].Label = %q, want %q", got.Docs[0].Label, "Ingress path types")
	}
	if got.Docs[0].URL != "https://kubernetes.io/docs/concepts/services-networking/ingress/" {
		t.Errorf("Docs[0].URL = %q, want it served verbatim", got.Docs[0].URL)
	}
}

// A question with no docs must omit the key entirely rather than send an
// empty array: the client's field is optional, and `docs: []` would make
// "no reading" a thing it has to measure the length of.
func TestSolutionOmitsDocsWhenThereAreNone(t *testing.T) {
	ts := newTestServer(t)
	if _, err := ts.mgr.Start(session.ModeExam, time.Hour); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := ts.mgr.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}

	rec := ts.do(t, http.MethodGet, "/api/questions/q02/solution")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}
	if body := rec.Body.String(); strings.Contains(body, "docs") {
		t.Errorf("body = %s, want no docs key at all", body)
	}
}

type sessionResponse struct {
	State            string `json:"state"`
	StartedAt        string `json:"startedAt"`
	DurationSeconds  int    `json:"durationSeconds"`
	RemainingSeconds int    `json:"remainingSeconds"`
	EndReason        string `json:"endReason"`
}

func TestSessionStartThenConflict(t *testing.T) {
	ts := newTestServer(t)

	rec := ts.do(t, http.MethodGet, "/api/session")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/session status = %d, want 200", rec.Code)
	}
	snap := decodeJSON[sessionResponse](t, rec)
	if snap.State != "idle" {
		t.Errorf("initial State = %q, want idle", snap.State)
	}

	rec = ts.do(t, http.MethodPost, "/api/session/start")
	if rec.Code != http.StatusOK {
		t.Fatalf("first start status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}
	started := decodeJSON[sessionResponse](t, rec)
	if started.State != "running" {
		t.Errorf("State after start = %q, want running", started.State)
	}
	if started.RemainingSeconds != 600 {
		t.Errorf("RemainingSeconds after start = %d, want 600", started.RemainingSeconds)
	}

	rec = ts.do(t, http.MethodPost, "/api/session/start")
	if rec.Code != http.StatusConflict {
		t.Errorf("second start status = %d, want 409, body=%s", rec.Code, rec.Body.String())
	}
}

func TestSessionEndLifecycle(t *testing.T) {
	ts := newTestServer(t)

	// idle -> end: 409.
	rec := ts.do(t, http.MethodPost, "/api/session/end")
	if rec.Code != http.StatusConflict {
		t.Fatalf("end while idle status = %d, want 409, body=%s", rec.Code, rec.Body.String())
	}
	if ts.grader.calls != 0 {
		t.Errorf("grader.calls after idle end attempt = %d, want 0", ts.grader.calls)
	}

	if _, err := ts.mgr.Start(session.ModeExam, time.Hour); err != nil {
		t.Fatalf("Start: %v", err)
	}

	// running -> end: 202, grade kicked.
	rec = ts.do(t, http.MethodPost, "/api/session/end")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("end while running status = %d, want 202, body=%s", rec.Code, rec.Body.String())
	}
	if ts.grader.calls != 1 {
		t.Errorf("grader.calls after running end = %d, want 1", ts.grader.calls)
	}
	ended := decodeJSON[sessionResponse](t, rec)
	if ended.State != "ended" || ended.EndReason != "submitted" {
		t.Errorf("state after end = %+v, want state=ended endReason=submitted", ended)
	}

	// ended, no results yet -> end again: 202 re-grade.
	rec = ts.do(t, http.MethodPost, "/api/session/end")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("re-grade end status = %d, want 202, body=%s", rec.Code, rec.Body.String())
	}
	if ts.grader.calls != 2 {
		t.Errorf("grader.calls after re-grade end = %d, want 2", ts.grader.calls)
	}

	// once results are recorded, ended-with-results -> end: 409.
	if err := ts.mgr.SetResults(ts.mgr.AttemptToken(), mustJSON(t, map[string]int{"earned": 1})); err != nil {
		t.Fatalf("SetResults: %v", err)
	}
	rec = ts.do(t, http.MethodPost, "/api/session/end")
	if rec.Code != http.StatusConflict {
		t.Errorf("end after graded status = %d, want 409, body=%s", rec.Code, rec.Body.String())
	}
	if ts.grader.calls != 2 {
		t.Errorf("grader.calls after conflicting end = %d, want unchanged 2", ts.grader.calls)
	}
}

func mustJSON(t *testing.T, v any) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return data
}

func TestResultsLifecycle(t *testing.T) {
	ts := newTestServer(t)

	// idle -> results: 409.
	rec := ts.do(t, http.MethodGet, "/api/results")
	if rec.Code != http.StatusConflict {
		t.Fatalf("results while idle status = %d, want 409, body=%s", rec.Code, rec.Body.String())
	}

	if _, err := ts.mgr.Start(session.ModeExam, time.Hour); err != nil {
		t.Fatalf("Start: %v", err)
	}

	// running -> results: 409.
	rec = ts.do(t, http.MethodGet, "/api/results")
	if rec.Code != http.StatusConflict {
		t.Fatalf("results while running status = %d, want 409, body=%s", rec.Code, rec.Body.String())
	}

	if err := ts.mgr.End("submitted"); err != nil {
		t.Fatalf("End: %v", err)
	}

	// ended, not graded yet: 202 grading.
	rec = ts.do(t, http.MethodGet, "/api/results")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("results while grading status = %d, want 202, body=%s", rec.Code, rec.Body.String())
	}
	var grading struct {
		State string `json:"state"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &grading); err != nil {
		t.Fatalf("decode grading body: %v", err)
	}
	if grading.State != "grading" {
		t.Errorf("grading body state = %q, want grading", grading.State)
	}

	// gradeError set: 500 with the error message.
	if err := ts.mgr.SetGradeError(ts.mgr.AttemptToken(), "ssh unreachable"); err != nil {
		t.Fatalf("SetGradeError: %v", err)
	}
	rec = ts.do(t, http.MethodGet, "/api/results")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("results with gradeError status = %d, want 500, body=%s", rec.Code, rec.Body.String())
	}
	var errBody struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &errBody); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if errBody.Error != "ssh unreachable" {
		t.Errorf("error body = %q, want %q", errBody.Error, "ssh unreachable")
	}

	// results recorded: 200 with the raw results JSON, superseding the
	// earlier gradeError.
	want := mustJSON(t, map[string]any{"earned": 9, "total": 9, "percent": 100})
	if err := ts.mgr.SetResults(ts.mgr.AttemptToken(), want); err != nil {
		t.Fatalf("SetResults: %v", err)
	}
	rec = ts.do(t, http.MethodGet, "/api/results")
	if rec.Code != http.StatusOK {
		t.Fatalf("results after graded status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	var gotResults, wantResults map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &gotResults); err != nil {
		t.Fatalf("decode results body: %v", err)
	}
	if err := json.Unmarshal(want, &wantResults); err != nil {
		t.Fatalf("decode want: %v", err)
	}
	if len(gotResults) != len(wantResults) {
		t.Fatalf("results body = %v, want %v", gotResults, wantResults)
	}
	for k, v := range wantResults {
		if gotResults[k] != v {
			t.Errorf("results[%q] = %v, want %v", k, gotResults[k], v)
		}
	}
}

func TestDeleteSessionResetsFromAnyState(t *testing.T) {
	cases := []struct {
		name  string
		setup func(t *testing.T, ts *testServer)
	}{
		{"idle", func(t *testing.T, ts *testServer) {}},
		{"running", func(t *testing.T, ts *testServer) {
			if _, err := ts.mgr.Start(session.ModeExam, time.Hour); err != nil {
				t.Fatalf("Start: %v", err)
			}
		}},
		{"ended", func(t *testing.T, ts *testServer) {
			if _, err := ts.mgr.Start(session.ModeExam, time.Hour); err != nil {
				t.Fatalf("Start: %v", err)
			}
			if err := ts.mgr.End("submitted"); err != nil {
				t.Fatalf("End: %v", err)
			}
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ts := newTestServer(t)
			c.setup(t, ts)

			rec := ts.do(t, http.MethodDelete, "/api/session")
			if rec.Code != http.StatusNoContent {
				t.Fatalf("DELETE /api/session from %s status = %d, want 204, body=%s", c.name, rec.Code, rec.Body.String())
			}

			rec = ts.do(t, http.MethodGet, "/api/session")
			snap := decodeJSON[sessionResponse](t, rec)
			if snap.State != "idle" {
				t.Errorf("state after DELETE from %s = %q, want idle", c.name, snap.State)
			}
		})
	}
}

func TestDesktopMountedWithOriginalPaths(t *testing.T) {
	ts := newTestServer(t)

	cases := []string{"/desktop", "/desktop/", "/desktop/vnc.html"}
	for _, p := range cases {
		rec := ts.do(t, http.MethodGet, p)
		if rec.Code != http.StatusTeapot {
			t.Errorf("GET %s status = %d, want 418 (from fake desktop handler), body=%s", p, rec.Code, rec.Body.String())
			continue
		}
		if want := "desktop:" + p; rec.Body.String() != want {
			t.Errorf("GET %s body = %q, want %q (original unstripped path)", p, rec.Body.String(), want)
		}
	}
}

func TestSPAFallbackServesIndexForUnknownPath(t *testing.T) {
	ts := newTestServer(t)
	rec := ts.do(t, http.MethodGet, "/score")

	if rec.Code != http.StatusOK {
		t.Fatalf("GET /score status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}
	if got := rec.Body.String(); got != "<html>ui placeholder</html>" {
		t.Errorf("GET /score body = %q, want the embedded index.html", got)
	}
}

func TestSPAServesRealStaticAsset(t *testing.T) {
	ts := newTestServer(t)
	rec := ts.do(t, http.MethodGet, "/assets/app.js")

	if rec.Code != http.StatusOK {
		t.Fatalf("GET /assets/app.js status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}
	if got := rec.Body.String(); got != "console.log('hi');" {
		t.Errorf("GET /assets/app.js body = %q, want the real asset content, not index.html", got)
	}
}

func TestSPAFallbackDoesNotSwallowUnknownAPIPaths(t *testing.T) {
	ts := newTestServer(t)
	rec := ts.do(t, http.MethodGet, "/api/does-not-exist")

	if rec.Code != http.StatusNotFound {
		t.Errorf("GET /api/does-not-exist status = %d, want 404 (not the SPA index.html), body=%s", rec.Code, rec.Body.String())
	}
	if bytes.Contains(rec.Body.Bytes(), []byte("<html>")) {
		t.Errorf("GET /api/does-not-exist body looks like the SPA index.html, want a JSON error: %s", rec.Body.String())
	}
}

func TestRootServesIndex(t *testing.T) {
	ts := newTestServer(t)
	rec := ts.do(t, http.MethodGet, "/")

	if rec.Code != http.StatusOK {
		t.Fatalf("GET / status = %d, want 200", rec.Code)
	}
	if got := rec.Body.String(); got != "<html>ui placeholder</html>" {
		t.Errorf("GET / body = %q, want the embedded index.html", got)
	}
}

func TestControlProxyMounted(t *testing.T) {
	ts := newTestServer(t)

	rec := ts.do(t, http.MethodPost, "/api/control/reset")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("control status = %d, want 202 from the control handler", rec.Code)
	}
	if got := rec.Body.String(); got != "control:/api/control/reset" {
		t.Errorf("control body = %q — the proxy must see the full unstripped path", got)
	}

	// The /api/* JSON-404 guard for unknown endpoints must be unaffected.
	rec = ts.do(t, http.MethodGet, "/api/nonexistent")
	if rec.Code != http.StatusNotFound {
		t.Errorf("unknown api path = %d, want 404", rec.Code)
	}
}

func TestBootEndpointReportsReadyWithoutAReader(t *testing.T) {
	ts := newTestServer(t)

	rec := ts.do(t, http.MethodGet, "/api/boot")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/boot = %d, want 200", rec.Code)
	}
	var got bootstate.State
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !got.Ready() {
		t.Errorf("state = %q, want ready when no reader is wired", got.State)
	}
}

// A booting environment must still answer /api/boot — that endpoint is
// what the progress screen polls, so returning an error there would
// leave the candidate with nothing to look at during the exact window
// the endpoint exists to cover.
func TestBootEndpointReportsBooting(t *testing.T) {
	ts := newBootingTestServer(t)

	rec := ts.do(t, http.MethodGet, "/api/boot")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/boot = %d, want 200 even while booting", rec.Code)
	}
	var got bootstate.State
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.State != bootstate.StateBooting {
		t.Errorf("state = %q, want %q", got.State, bootstate.StateBooting)
	}
	if got.Label == "" {
		t.Error("label is empty; the progress screen has nothing to render")
	}
}

// Starting an attempt against a half-built cluster burns real exam time
// on questions whose seed data does not exist yet.
func TestSessionStartRefusedWhileBooting(t *testing.T) {
	ts := newBootingTestServer(t)

	rec := ts.do(t, http.MethodPost, "/api/session/start")
	if rec.Code != http.StatusConflict {
		t.Fatalf("POST /api/session/start while booting = %d, want 409", rec.Code)
	}
	if snap := ts.mgr.Snapshot(); snap.State != "idle" {
		t.Errorf("session state = %q, want it left idle", snap.State)
	}
}

// The compose healthcheck points at /healthz. It must keep reporting the
// process's own health and must not start depending on cluster
// readiness, or the facilitator would be marked unhealthy for the whole
// of a boot it is deliberately meant to serve through.
func TestHealthzIndependentOfBootState(t *testing.T) {
	ts := newBootingTestServer(t)

	rec := ts.do(t, http.MethodGet, "/healthz")
	if rec.Code != http.StatusOK {
		t.Errorf("GET /healthz while booting = %d, want 200", rec.Code)
	}
}

// examModes is the "modes" slice of GET /api/exam, decoded on its own so
// this test does not have to widen the examResponse fixture above.
type examModesResponse struct {
	Modes []struct {
		ID              string `json:"id"`
		DurationSeconds int    `json:"durationSeconds"`
		Untimed         bool   `json:"untimed"`
		HelpAllowed     bool   `json:"helpAllowed"`
		GradesPerTask   bool   `json:"gradesPerTask"`
		Recorded        bool   `json:"recorded"`
		Recommended     bool   `json:"recommended"`
	} `json:"modes"`
}

func TestExamModes(t *testing.T) {
	ts := newTestServer(t)
	rec := ts.do(t, http.MethodGet, "/api/exam")
	got := decodeJSON[examModesResponse](t, rec).Modes

	// Order is the order the mode screen offers them: gentlest first.
	want := []string{session.ModeTraining, session.ModeSpeed, session.ModeExam}
	if len(got) != len(want) {
		t.Fatalf("len(Modes) = %d, want %d", len(got), len(want))
	}
	for i, id := range want {
		if got[i].ID != id {
			t.Errorf("Modes[%d].ID = %q, want %q", i, got[i].ID, id)
		}
	}

	// The clocks come from the bank: 600s duration, so a speed run is
	// half of it, and training has no clock at all.
	if got[0].DurationSeconds != 0 || !got[0].Untimed {
		t.Errorf("training = %+v, want durationSeconds=0 untimed=true", got[0])
	}
	if got[1].DurationSeconds != 300 || got[1].Untimed {
		t.Errorf("speed = %+v, want durationSeconds=300 untimed=false", got[1])
	}
	if got[2].DurationSeconds != 600 || got[2].Untimed {
		t.Errorf("exam = %+v, want durationSeconds=600 untimed=false", got[2])
	}

	// Exactly one card is accented, and it is not the untimed one.
	accented := ""
	for _, m := range got {
		if m.Recommended {
			if accented != "" {
				t.Errorf("two recommended modes: %q and %q", accented, m.ID)
			}
			accented = m.ID
		}
	}
	if accented != session.ModeSpeed {
		t.Errorf("recommended mode = %q, want %q", accented, session.ModeSpeed)
	}

	// Training is practice, not a sitting.
	if got[0].Recorded {
		t.Error("training.Recorded = true, want false")
	}
	if !got[1].Recorded || !got[2].Recorded {
		t.Error("speed and exam must both be recorded attempts")
	}
}

// TestExamModesMatchEnforcement is the point of describing modes on the
// server: a card must not be able to promise something the handlers then
// refuse. It starts an attempt in each advertised mode and checks the
// two gated endpoints against that mode's own flags.
func TestExamModesMatchEnforcement(t *testing.T) {
	ts := newTestServer(t)
	modes := decodeJSON[examModesResponse](t, ts.do(t, http.MethodGet, "/api/exam")).Modes

	for _, m := range modes {
		t.Run(m.ID, func(t *testing.T) {
			// A fresh manager per subtest: Start is a one-way transition.
			ts := newTestServer(t)
			if _, err := ts.mgr.Start(m.ID, time.Hour); err != nil {
				t.Fatalf("Start(%q): %v", m.ID, err)
			}

			// 403 is the gate's answer specifically. A hintless question
			// (404) or an absent practice grader (501) means the request
			// got past the gate, which is what these assert.
			hint := ts.do(t, http.MethodGet, "/api/questions/q01/hints/1")
			if forbidden := hint.Code == http.StatusForbidden; forbidden == m.HelpAllowed {
				t.Errorf("hints: status %d with helpAllowed=%v", hint.Code, m.HelpAllowed)
			}

			grade := ts.do(t, http.MethodPost, "/api/session/grade")
			if forbidden := grade.Code == http.StatusForbidden; forbidden == m.GradesPerTask {
				t.Errorf("grade: status %d with gradesPerTask=%v", grade.Code, m.GradesPerTask)
			}
		})
	}
}
