package api_test

import (
	"net/http"
	"strconv"
	"testing"
	"testing/fstest"

	"kubestronaut-sim/facilitator/internal/api"
	"kubestronaut-sim/facilitator/internal/exam"
	"kubestronaut-sim/facilitator/internal/session"
)

const (
	mcqPoolExamJSON = "testdata/exam-mcq-pool.json"
	mcqPoolBankDir  = "testdata/bank-mcq-pool"
)

func newMCQPoolTestServer(t *testing.T) *testServer {
	t.Helper()

	ex, err := exam.Load(mcqPoolExamJSON, mcqPoolBankDir)
	if err != nil {
		t.Fatalf("exam.Load: %v", err)
	}

	clock, setNow := fakeClock(epoch)
	mgr, err := session.New(t.TempDir()+"/session.json", ex.Name, ex.Duration, clock, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}

	grader := &fakeGrader{}
	h := api.New(ex, mcqPoolBankDir, mgr, grader.Grade, fakeDesktop, fakeControl, fstest.MapFS{}, nil, nil)
	return &testServer{handler: h, mgr: mgr, grader: grader, setNow: setNow}
}

func TestMCQPoolQuestionCountBeforeStart(t *testing.T) {
	ts := newMCQPoolTestServer(t)
	rec := ts.do(t, http.MethodGet, "/api/exam")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[examResponse](t, rec)

	if got.QuestionCount != 5 {
		t.Errorf("QuestionCount = %d, want 5 (the declared draw length)", got.QuestionCount)
	}
	if len(got.Questions) != 9 {
		t.Errorf("len(Questions) = %d, want 9 (the full pool, nothing drawn yet)", len(got.Questions))
	}
}

func TestMCQPoolExamListsDrawnSubsetAfterStart(t *testing.T) {
	ts := newMCQPoolTestServer(t)
	startMCQ(t, ts)

	rec := ts.do(t, http.MethodGet, "/api/exam")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	got := decodeJSON[examResponse](t, rec)

	if got.QuestionCount != 5 {
		t.Errorf("QuestionCount = %d, want 5", got.QuestionCount)
	}
	if len(got.Questions) != 5 {
		t.Fatalf("len(Questions) = %d, want 5 (the drawn subset)", len(got.Questions))
	}

	seen := map[string]bool{}
	domainCounts := map[string]int{}
	for _, q := range got.Questions {
		if seen[q.ID] {
			t.Errorf("id %q listed twice", q.ID)
		}
		seen[q.ID] = true
		domainCounts[q.Domain]++
	}
	if domainCounts["Domain A"] != 3 {
		t.Errorf("Domain A count = %d, want 3", domainCounts["Domain A"])
	}
	if domainCounts["Domain B"] != 2 {
		t.Errorf("Domain B count = %d, want 2", domainCounts["Domain B"])
	}
}

func TestMCQPoolQuestionOutsideDrawIs404(t *testing.T) {
	ts := newMCQPoolTestServer(t)
	startMCQ(t, ts)

	rec := ts.do(t, http.MethodGet, "/api/exam")
	got := decodeJSON[examResponse](t, rec)
	drawn := map[string]bool{}
	for _, q := range got.Questions {
		drawn[q.ID] = true
	}

	allIDs := []string{"a1", "a2", "a3", "a4", "a5", "b1", "b2", "b3", "b4"}
	var excluded string
	for _, id := range allIDs {
		if !drawn[id] {
			excluded = id
			break
		}
	}
	if excluded == "" {
		t.Fatal("every pool id was drawn — fixture is too small to prove exclusion (want pool > examLength)")
	}

	if rec := ts.do(t, http.MethodGet, "/api/questions/"+excluded); rec.Code != http.StatusNotFound {
		t.Errorf("GET a question outside the draw (%s): status = %d, want 404", excluded, rec.Code)
	}
	if rec := ts.doJSON(t, http.MethodPut, "/api/questions/"+excluded+"/answer", `{"selected":[0]}`); rec.Code != http.StatusNotFound {
		t.Errorf("PUT an answer outside the draw (%s): status = %d, want 404", excluded, rec.Code)
	}

	var included string
	for id := range drawn {
		included = id
		break
	}
	if rec := ts.do(t, http.MethodGet, "/api/questions/"+included); rec.Code != http.StatusOK {
		t.Errorf("GET a drawn question (%s): status = %d, want 200", included, rec.Code)
	}
}

func TestMCQPoolAnswerEndLifecycleReachesGrading(t *testing.T) {
	ts := newMCQPoolTestServer(t)
	startMCQ(t, ts)

	rec := ts.do(t, http.MethodGet, "/api/exam")
	got := decodeJSON[examResponse](t, rec)
	if len(got.Questions) != 5 {
		t.Fatalf("len(Questions) = %d, want 5", len(got.Questions))
	}

	for _, q := range got.Questions {
		correct := 0
		if q.Domain == "Domain B" {
			correct = 1
		}
		body := `{"selected":[` + strconv.Itoa(correct) + `]}`
		if rec := ts.doJSON(t, http.MethodPut, "/api/questions/"+q.ID+"/answer", body); rec.Code != http.StatusOK {
			t.Fatalf("PUT %s: status = %d, body=%s", q.ID, rec.Code, rec.Body.String())
		}
	}

	rec = ts.do(t, http.MethodPost, "/api/session/end")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("end: status = %d", rec.Code)
	}
	if ts.grader.calls != 1 {
		t.Errorf("grader.calls = %d, want 1 (End must kick grading exactly once)", ts.grader.calls)
	}
}

func TestMCQPoolRepeatedAttemptsNeverSeedOrGate(t *testing.T) {
	ex, err := exam.Load(mcqPoolExamJSON, mcqPoolBankDir)
	if err != nil {
		t.Fatalf("exam.Load: %v", err)
	}
	clock, _ := fakeClock(epoch)
	mgr, err := session.New(t.TempDir()+"/session.json", ex.Name, ex.Duration, clock, func() {})
	if err != nil {
		t.Fatalf("session.New: %v", err)
	}
	grader := &fakeGrader{}
	seeder := newFakeSeeder()
	conductor := &conductorStub{status: `{"busy":true,"job":{"id":"job-7","op":"seed"}}`}
	h := api.New(ex, mcqPoolBankDir, mgr, grader.Grade, fakeDesktop, conductor, fstest.MapFS{}, nil, nil,
		api.WithSeeder(seeder))
	ts := &testServer{handler: h, mgr: mgr, grader: grader}

	for i := 1; i <= 3; i++ {
		rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`)
		if rec.Code != http.StatusOK {
			t.Fatalf("start %d: status = %d, want 200, body=%s", i, rec.Code, rec.Body.String())
		}
		if got := ts.session(t); got.Preparing != nil || got.PrepareError != "" {
			t.Fatalf("start %d: preparing = %+v, prepareError = %q; an mcq bank has neither",
				i, got.Preparing, got.PrepareError)
		}
		if rec := ts.do(t, http.MethodDelete, "/api/session"); rec.Code != http.StatusNoContent {
			t.Fatalf("delete %d: status = %d, want 204", i, rec.Code)
		}
	}
	if n := seeder.starts(); n != 0 {
		t.Errorf("seeder was asked to prepare a cluster %d times for an mcq bank", n)
	}
	if conductor.asked("/api/control/status") {
		t.Error("an mcq bank asked the conductor about seed jobs")
	}
}
