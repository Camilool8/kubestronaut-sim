package api_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"kubestronaut-sim/facilitator/internal/api"
	"kubestronaut-sim/facilitator/internal/bootstate"
	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/session"
)

const (
	mcqExamJSON = "testdata/exam-mcq.json"
	mcqBankDir  = "testdata/bank-mcq"
)

// newMCQTestServer is newTestServer for the mcq fixture exam. booting
// selects a boot reader pointed at paths that do not exist (an
// environment still starting) — the state the mcq boot-gate bypass must
// be proven against.
func newMCQTestServer(t *testing.T, booting bool) *testServer {
	t.Helper()

	ex, err := exam.Load(mcqExamJSON, mcqBankDir)
	if err != nil {
		t.Fatalf("exam.Load: %v", err)
	}

	clock, setNow := fakeClock(epoch)
	mgr, err := session.New(t.TempDir()+"/session.json", ex.Name, ex.Duration, clock, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}

	var boot *bootstate.Reader
	if booting {
		dir := t.TempDir()
		boot = bootstate.New(dir+"/boot.json", dir+"/ready")
	}

	grader := &fakeGrader{}
	h := api.New(ex, mcqBankDir, mgr, grader.Grade, fakeDesktop, fakeControl, fstest.MapFS{}, boot, nil)
	return &testServer{handler: h, mgr: mgr, grader: grader, setNow: setNow}
}

// doJSON issues a request with a JSON body.
func (ts *testServer) doJSON(t *testing.T, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	ts.handler.ServeHTTP(rec, req)
	return rec
}

func startMCQ(t *testing.T, ts *testServer) {
	t.Helper()
	rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("start: status = %d, body=%s", rec.Code, rec.Body.String())
	}
}

func TestMCQExamResponse(t *testing.T) {
	ts := newMCQTestServer(t, false)
	rec := ts.do(t, http.MethodGet, "/api/exam")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}

	got := decodeJSON[struct {
		ExamType  string `json:"examType"`
		Questions []struct {
			ID          string `json:"id"`
			Weight      int    `json:"weight"`
			TotalPoints int    `json:"totalPoints"`
			Multi       bool   `json:"multi"`
		} `json:"questions"`
	}](t, rec)

	if got.ExamType != "mcq" {
		t.Errorf("examType = %q, want mcq", got.ExamType)
	}
	if len(got.Questions) != 2 {
		t.Fatalf("len(questions) = %d, want 2", len(got.Questions))
	}
	// Weight defaults to 1 and totalPoints mirrors it for mcq.
	if got.Questions[0].Weight != 1 || got.Questions[0].TotalPoints != 1 {
		t.Errorf("q01 weight/totalPoints = %d/%d, want 1/1",
			got.Questions[0].Weight, got.Questions[0].TotalPoints)
	}
	if got.Questions[0].Multi || !got.Questions[1].Multi {
		t.Errorf("multi flags = %v/%v, want false/true",
			got.Questions[0].Multi, got.Questions[1].Multi)
	}
	// An mcq exam has no instances; the key must not even appear.
	if strings.Contains(rec.Body.String(), `"instance"`) {
		t.Errorf("exam response contains an instance key: %s", rec.Body.String())
	}
}

func TestMCQQuestionServesOptionsNeverTheKey(t *testing.T) {
	ts := newMCQTestServer(t, false)
	rec := ts.do(t, http.MethodGet, "/api/questions/q02")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}

	got := decodeJSON[struct {
		Options []string `json:"options"`
		Multi   bool     `json:"multi"`
	}](t, rec)
	if len(got.Options) != 4 || got.Options[2] != "Three" {
		t.Errorf("options = %v, want the 4 fixture options", got.Options)
	}
	if !got.Multi {
		t.Errorf("multi = false, want true")
	}
	// The single most important negative assertion in this file: the
	// answer key never rides along with a question.
	if strings.Contains(rec.Body.String(), `"correct"`) {
		t.Errorf("question response leaks the answer key: %s", rec.Body.String())
	}
}

// The boot gate exists to protect a cluster the mcq engine does not use:
// an mcq attempt must start even while the environment is still booting,
// and the same not-ready reader must still refuse a hands-on start.
func TestMCQStartBypassesBootGate(t *testing.T) {
	mcq := newMCQTestServer(t, true)
	rec := mcq.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`)
	if rec.Code != http.StatusOK {
		t.Errorf("mcq start while booting: status = %d, want 200 (body=%s)", rec.Code, rec.Body.String())
	}

	handsOn := newBootingTestServer(t)
	rec = handsOn.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`)
	if rec.Code != http.StatusConflict {
		t.Errorf("hands-on start while booting: status = %d, want 409", rec.Code)
	}
}

func TestAnswerPutLifecycle(t *testing.T) {
	ts := newMCQTestServer(t, false)

	// Idle: state gate fires before the id lookup — even a bogus id gets
	// the 409, not a 404 oracle.
	rec := ts.doJSON(t, http.MethodPut, "/api/questions/q99/answer", `{"selected":[0]}`)
	if rec.Code != http.StatusConflict {
		t.Errorf("PUT while idle: status = %d, want 409", rec.Code)
	}

	startMCQ(t, ts)

	rec = ts.doJSON(t, http.MethodPut, "/api/questions/q99/answer", `{"selected":[0]}`)
	if rec.Code != http.StatusNotFound {
		t.Errorf("PUT unknown question: status = %d, want 404", rec.Code)
	}

	cases := []struct {
		name, path, body string
	}{
		{"out of range", "/api/questions/q01/answer", `{"selected":[3]}`},
		{"negative", "/api/questions/q01/answer", `{"selected":[-1]}`},
		{"duplicate", "/api/questions/q02/answer", `{"selected":[0,0]}`},
		{"multi on single", "/api/questions/q01/answer", `{"selected":[0,1]}`},
		{"not json", "/api/questions/q01/answer", `nope`},
	}
	for _, c := range cases {
		if rec := ts.doJSON(t, http.MethodPut, c.path, c.body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400 (body=%s)", c.name, rec.Code, rec.Body.String())
		}
	}

	// Upsert, unsorted input comes back sorted.
	rec = ts.doJSON(t, http.MethodPut, "/api/questions/q02/answer", `{"selected":[2,0]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT: status = %d, body=%s", rec.Code, rec.Body.String())
	}
	put := decodeJSON[struct {
		ID       string `json:"id"`
		Selected []int  `json:"selected"`
	}](t, rec)
	if put.ID != "q02" || len(put.Selected) != 2 || put.Selected[0] != 0 || put.Selected[1] != 2 {
		t.Errorf("PUT response = %+v, want q02 [0 2]", put)
	}

	rec = ts.do(t, http.MethodGet, "/api/answers")
	all := decodeJSON[struct {
		Answers map[string][]int `json:"answers"`
	}](t, rec)
	if a := all.Answers["q02"]; len(a) != 2 || a[0] != 0 || a[1] != 2 {
		t.Errorf("GET /api/answers q02 = %v, want [0 2]", a)
	}

	// Empty selection clears the entry.
	if rec := ts.doJSON(t, http.MethodPut, "/api/questions/q02/answer", `{"selected":[]}`); rec.Code != http.StatusOK {
		t.Fatalf("PUT clear: status = %d", rec.Code)
	}
	rec = ts.do(t, http.MethodGet, "/api/answers")
	all = decodeJSON[struct {
		Answers map[string][]int `json:"answers"`
	}](t, rec)
	if _, ok := all.Answers["q02"]; ok {
		t.Errorf("q02 still present after clearing: %v", all.Answers)
	}

	// Answer, end, then: writes 409, reads still work (the review needs
	// them), and the key still never appears.
	if rec := ts.doJSON(t, http.MethodPut, "/api/questions/q01/answer", `{"selected":[1]}`); rec.Code != http.StatusOK {
		t.Fatalf("PUT: status = %d", rec.Code)
	}
	if rec := ts.do(t, http.MethodPost, "/api/session/end"); rec.Code != http.StatusAccepted {
		t.Fatalf("end: status = %d", rec.Code)
	}
	if rec := ts.doJSON(t, http.MethodPut, "/api/questions/q01/answer", `{"selected":[0]}`); rec.Code != http.StatusConflict {
		t.Errorf("PUT after end: status = %d, want 409", rec.Code)
	}
	rec = ts.do(t, http.MethodGet, "/api/answers")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"q01":[1]`) {
		t.Errorf("GET /api/answers after end = %d %s, want 200 with q01 [1]", rec.Code, rec.Body.String())
	}
}

func TestAnswerPutRejectsHandsOnExam(t *testing.T) {
	ts := newTestServer(t)
	rec := ts.doJSON(t, http.MethodPut, "/api/questions/q01/answer", `{"selected":[0]}`)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("PUT on hands-on exam: status = %d, want 400", rec.Code)
	}
}
